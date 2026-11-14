package com.offgrid.mesh

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@SuppressLint("MissingPermission")
class NativeMeshBridge(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NativeMeshBridge"

        // Authoritative OFFGRID BLE 128-bit UUIDs
        val SERVICE_UUID: UUID = UUID.fromString("00000ff9-0000-1000-8000-00805f9b34fb")
        val CHARACTERISTIC_HANDSHAKE: UUID = UUID.fromString("00000ff1-0000-1000-8000-00805f9b34fb")
        val CHARACTERISTIC_TRANSFER: UUID = UUID.fromString("00000ff2-0000-1000-8000-00805f9b34fb")
    }

    private val bluetoothManager: BluetoothManager? =
        reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager?.adapter

    private var advertiser: BluetoothLeAdvertiser? = null
    private var scanner: BluetoothLeScanner? = null
    private var gattServer: BluetoothGattServer? = null

    private val connectedClients = ConcurrentHashMap<String, BluetoothDevice>()
    private val clientGatts = ConcurrentHashMap<String, BluetoothGatt>()

    private var localPublicKeyFingerprint: String = "OFFGRID"

    override fun getName(): String = NAME

    private fun sendEvent(eventName: String, params: Any?) {
        if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    @ReactMethod
    fun initialize(publicKeyFingerprint: String, promise: Promise) {
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
            promise.reject("BLUETOOTH_DISABLED", "Bluetooth adapter is disabled or unavailable")
            return
        }

        localPublicKeyFingerprint = publicKeyFingerprint
        advertiser = bluetoothAdapter.bluetoothLeAdvertiser
        scanner = bluetoothAdapter.bluetoothLeScanner

        setupGattServer()
        promise.resolve(true)
    }

    private fun setupGattServer() {
        if (gattServer != null || bluetoothManager == null) return

        val serverCallback = object : BluetoothGattServerCallback() {
            override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    connectedClients[device.address] = device
                    val peerMap = Arguments.createMap().apply {
                        putString("peerId", device.address)
                        putString("transport", "BLE")
                        putDouble("discoveredAt", System.currentTimeMillis().toDouble())
                    }
                    sendEvent("onPeerDiscovered", peerMap)
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    connectedClients.remove(device.address)
                    val disconnectMap = Arguments.createMap().apply {
                        putString("peerId", device.address)
                    }
                    sendEvent("onPeerDisconnected", disconnectMap)
                }
            }

            override fun onCharacteristicWriteRequest(
                device: BluetoothDevice,
                requestId: Int,
                characteristic: BluetoothGattCharacteristic,
                preparedWrite: Boolean,
                responseNeeded: Boolean,
                offset: Int,
                value: ByteArray?
            ) {
                if (value != null) {
                    val base64Payload = Base64.encodeToString(value, Base64.NO_WRAP)
                    val msgMap = Arguments.createMap().apply {
                        putString("peerId", device.address)
                        putString("payload", base64Payload)
                    }
                    sendEvent("onMessageReceived", msgMap)
                }
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
                }
            }
        }

        gattServer = bluetoothManager.openGattServer(reactApplicationContext, serverCallback)
        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)

        val handshakeChar = BluetoothGattCharacteristic(
            CHARACTERISTIC_HANDSHAKE,
            BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_WRITE,
            BluetoothGattCharacteristic.PERMISSION_READ or BluetoothGattCharacteristic.PERMISSION_WRITE
        )

        val transferChar = BluetoothGattCharacteristic(
            CHARACTERISTIC_TRANSFER,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE or BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )

        service.addCharacteristic(handshakeChar)
        service.addCharacteristic(transferChar)
        gattServer?.addService(service)
    }

    @ReactMethod
    fun startDiscovery(promise: Promise) {
        try {
            startAdvertisingInternal()
            startScanningInternal()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DISCOVERY_ERROR", e.message, e)
        }
    }

    private fun startAdvertisingInternal() {
        if (advertiser == null) {
            advertiser = bluetoothAdapter?.bluetoothLeAdvertiser
        }

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
            .setConnectable(true)
            .setTimeout(0)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .build()

        val pUuid = ParcelUuid(SERVICE_UUID)
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceUuid(pUuid)
            .build()

        val scanResponse = AdvertiseData.Builder()
            .addServiceData(pUuid, localPublicKeyFingerprint.take(8).toByteArray(Charsets.UTF_8))
            .build()

        val callback = object : AdvertiseCallback() {
            override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
                android.util.Log.i("OFFGRID_BLE", "BLE advertising started successfully")
            }
            override fun onStartFailure(errorCode: Int) {
                android.util.Log.e("OFFGRID_BLE", "BLE advertising failed with code $errorCode")
            }
        }

        advertiser?.startAdvertising(settings, data, scanResponse, callback)
    }

    private fun startScanningInternal() {
        if (scanner == null) {
            scanner = bluetoothAdapter?.bluetoothLeScanner
        }

        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
            .build()

        val scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val device = result.device
                val peerMap = Arguments.createMap().apply {
                    putString("peerId", device.address)
                    putString("transport", "BLE")
                    putInt("rssi", result.rssi)
                    putDouble("discoveredAt", System.currentTimeMillis().toDouble())
                }
                sendEvent("onPeerDiscovered", peerMap)

                // Auto-connect to newly discovered peer
                if (!clientGatts.containsKey(device.address) && !connectedClients.containsKey(device.address)) {
                    connectInternal(device)
                }
            }
        }

        scanner?.startScan(listOf(filter), settings, scanCallback)
    }

    @ReactMethod
    fun stopDiscovery(promise: Promise) {
        try {
            advertiser?.stopAdvertising(object : AdvertiseCallback() {})
            scanner?.stopScan(object : ScanCallback() {})
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_DISCOVERY_ERROR", e.message, e)
        }
    }

    private fun connectInternal(device: BluetoothDevice) {
        val peerId = device.address
        try {
            val gattCallback = object : BluetoothGattCallback() {
                override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        clientGatts[peerId] = gatt
                        gatt.requestMtu(512)
                        gatt.discoverServices()
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        clientGatts.remove(peerId)
                        val disconnectMap = Arguments.createMap().apply {
                            putString("peerId", peerId)
                        }
                        sendEvent("onPeerDisconnected", disconnectMap)
                    }
                }

                override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                    if (status == BluetoothGatt.GATT_SUCCESS) {
                        val service = gatt.getService(SERVICE_UUID)
                        val transferChar = service?.getCharacteristic(CHARACTERISTIC_TRANSFER)
                        if (transferChar != null) {
                            gatt.setCharacteristicNotification(transferChar, true)
                            val cccd = transferChar.getDescriptor(UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"))
                            if (cccd != null) {
                                cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                                gatt.writeDescriptor(cccd)
                            }
                        }
                    }
                }

                override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
                    val value = characteristic.value
                    if (value != null && value.isNotEmpty()) {
                        val base64Payload = Base64.encodeToString(value, Base64.NO_WRAP)
                        val msgMap = Arguments.createMap().apply {
                            putString("peerId", peerId)
                            putString("payload", base64Payload)
                        }
                        sendEvent("onMessageReceived", msgMap)
                    }
                }
            }

            val gatt = device.connectGatt(reactApplicationContext, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
            clientGatts[peerId] = gatt
        } catch (_: Exception) {}
    }

    @ReactMethod
    fun connect(peerId: String, promise: Promise) {
        try {
            val device = bluetoothAdapter?.getRemoteDevice(peerId)
            if (device == null) {
                promise.reject("DEVICE_NOT_FOUND", "Peer device not found: $peerId")
                return
            }
            connectInternal(device)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CONNECT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun disconnect(peerId: String, promise: Promise) {
        try {
            val gatt = clientGatts.remove(peerId)
            gatt?.disconnect()
            gatt?.close()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DISCONNECT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun send(peerId: String, payloadBase64: String, priority: Int, promise: Promise) {
        try {
            val gatt = clientGatts[peerId]
            if (gatt == null) {
                promise.reject("PEER_NOT_CONNECTED", "Peer is not connected: $peerId")
                return
            }

            val service = gatt.getService(SERVICE_UUID)
            val characteristic = service?.getCharacteristic(CHARACTERISTIC_TRANSFER)

            if (characteristic == null) {
                promise.reject("CHARACTERISTIC_NOT_FOUND", "Transfer characteristic not available")
                return
            }

            val rawBytes = Base64.decode(payloadBase64, Base64.NO_WRAP)
            characteristic.value = rawBytes
            characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            val success = gatt.writeCharacteristic(characteristic)

            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("SEND_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun broadcast(payloadBase64: String, priority: Int, promise: Promise) {
        // Broadcasts to all currently connected peer GATT clients & GATT server connections
        try {
            val rawBytes = Base64.decode(payloadBase64, Base64.NO_WRAP)
            var sentCount = 0

            // 1. Broadcast to client GATTs
            for ((_, gatt) in clientGatts) {
                val service = gatt.getService(SERVICE_UUID)
                val characteristic = service?.getCharacteristic(CHARACTERISTIC_TRANSFER)
                if (characteristic != null) {
                    characteristic.value = rawBytes
                    characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                    if (gatt.writeCharacteristic(characteristic)) {
                        sentCount++
                    }
                }
            }

            // 2. Broadcast to connected server clients via notify
            gattServer?.let { server ->
                val service = server.getService(SERVICE_UUID)
                val characteristic = service?.getCharacteristic(CHARACTERISTIC_TRANSFER)
                if (characteristic != null) {
                    characteristic.value = rawBytes
                    for ((_, clientDevice) in connectedClients) {
                        if (server.notifyCharacteristicChanged(clientDevice, characteristic, false)) {
                            sentCount++
                        }
                    }
                }
            }

            promise.resolve(sentCount)
        } catch (e: Exception) {
            promise.reject("BROADCAST_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun startForegroundService(promise: Promise) {
        try {
            MeshForegroundService.startService(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SERVICE_START_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopForegroundService(promise: Promise) {
        try {
            MeshForegroundService.stopService(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SERVICE_STOP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
