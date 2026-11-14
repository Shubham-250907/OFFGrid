package com.offgrid.mesh

import android.Manifest
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
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.ParcelUuid
import android.util.Base64
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@SuppressLint("MissingPermission")
class NativeMeshBridge(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    companion object {
        const val NAME = "NativeMeshBridge"

        // Authoritative OFFGRID BLE 128-bit UUIDs
        val SERVICE_UUID: UUID = UUID.fromString("00000ff9-0000-1000-8000-00805f9b34fb")
        val CHARACTERISTIC_HANDSHAKE: UUID = UUID.fromString("00000ff1-0000-1000-8000-00805f9b34fb")
        val CHARACTERISTIC_TRANSFER: UUID = UUID.fromString("00000ff2-0000-1000-8000-00805f9b34fb")
    }

    enum class GatewayStatus {
        INITIALIZING,
        READY,
        BLUETOOTH_DISABLED,
        PERMISSION_REQUIRED,
        PERMISSION_DENIED,
        BLUETOOTH_UNAVAILABLE,
        ERROR
    }

    private val bluetoothManager: BluetoothManager? =
        reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager?.adapter

    private var advertiser: BluetoothLeAdvertiser? = null
    private var scanner: BluetoothLeScanner? = null
    private var gattServer: BluetoothGattServer? = null

    private val connectedClients = ConcurrentHashMap<String, BluetoothDevice>()
    private val clientGatts = ConcurrentHashMap<String, BluetoothGatt>()
    private val connectingAddresses = ConcurrentHashMap.newKeySet<String>()

    private var localPublicKeyFingerprint: String = "OFFGRID"

    @Volatile
    private var currentStatus: GatewayStatus = GatewayStatus.INITIALIZING

    @Volatile
    private var isInitialized = false

    @Volatile
    private var isDiscoveryActive = false

    @Volatile
    private var discoveryRequested = false

    private var activeAdvertiseCallback: AdvertiseCallback? = null
    private var activeScanCallback: ScanCallback? = null

    private var bluetoothStateReceiver: BroadcastReceiver? = null
    private var isReceiverRegistered = false

    init {
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName(): String = NAME

    private fun sendEvent(eventName: String, params: Any?) {
        try {
            if (reactApplicationContext.hasActiveReactInstance()) {
                reactApplicationContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(eventName, params)
            }
        } catch (e: Exception) {
            android.util.Log.w("OFFGRID_BLE", "sendEvent notice for $eventName: ${e.message}")
        }
    }

    private fun updateStatus(newStatus: GatewayStatus, reason: String? = null) {
        val previous = currentStatus
        currentStatus = newStatus
        android.util.Log.i("OFFGRID_BLE", "Gateway status: ${previous.name} -> ${newStatus.name} (reason: $reason)")

        val map = Arguments.createMap().apply {
            putString("status", newStatus.name)
            putString("previousStatus", previous.name)
            if (reason != null) {
                putString("reason", reason)
            }
            putBoolean("isBluetoothEnabled", bluetoothAdapter?.isEnabled == true)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
        sendEvent("onGatewayStatusChanged", map)
    }

    private fun checkOperationPermission(operation: String = "all"): GatewayStatus {
        if (bluetoothAdapter == null) {
            return GatewayStatus.BLUETOOTH_UNAVAILABLE
        }

        val context = reactApplicationContext
        val activity = currentActivity
        val prefs = context.getSharedPreferences("offgrid_ble_perms", Context.MODE_PRIVATE)
        val hasRequested = prefs.getBoolean("has_requested_perms", false)

        fun checkPerm(perm: String): GatewayStatus? {
            val granted = ContextCompat.checkSelfPermission(context, perm) == PackageManager.PERMISSION_GRANTED
            if (granted) return null

            if (activity != null && hasRequested) {
                val canShowRationale = ActivityCompat.shouldShowRequestPermissionRationale(activity, perm)
                return if (canShowRationale) GatewayStatus.PERMISSION_REQUIRED else GatewayStatus.PERMISSION_DENIED
            }
            return GatewayStatus.PERMISSION_REQUIRED
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+ (API 31+): Validate permissions according to the operation
            when (operation) {
                "scan" -> {
                    checkPerm(Manifest.permission.BLUETOOTH_SCAN)?.let { return it }
                }
                "advertise" -> {
                    checkPerm(Manifest.permission.BLUETOOTH_ADVERTISE)?.let { return it }
                }
                "connect" -> {
                    checkPerm(Manifest.permission.BLUETOOTH_CONNECT)?.let { return it }
                }
                else -> {
                    // Mesh discovery requires scan, advertise, and connect
                    checkPerm(Manifest.permission.BLUETOOTH_SCAN)?.let { return it }
                    checkPerm(Manifest.permission.BLUETOOTH_ADVERTISE)?.let { return it }
                    checkPerm(Manifest.permission.BLUETOOTH_CONNECT)?.let { return it }
                }
            }
        } else {
            // Android 8 to 11 (API 26-30):
            // Scanning requires Location permission.
            // Foreground / foreground-service scanning does not require background location.
            if (operation == "scan" || operation == "all") {
                checkPerm(Manifest.permission.ACCESS_FINE_LOCATION)?.let { return it }

                val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
                val isLocationEnabled = locationManager?.isProviderEnabled(LocationManager.GPS_PROVIDER) == true ||
                                        locationManager?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) == true
                if (!isLocationEnabled) {
                    return GatewayStatus.PERMISSION_REQUIRED
                }
            }
        }

        if (!bluetoothAdapter.isEnabled) {
            return GatewayStatus.BLUETOOTH_DISABLED
        }

        return GatewayStatus.READY
    }

    private fun checkPermissionsAndAvailability(): GatewayStatus {
        return checkOperationPermission("all")
    }

    @ReactMethod
    fun markPermissionsRequested() {
        val prefs = reactApplicationContext.getSharedPreferences("offgrid_ble_perms", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("has_requested_perms", true).apply()
    }

    private synchronized fun registerBluetoothStateReceiver() {
        if (isReceiverRegistered) return
        bluetoothStateReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == BluetoothAdapter.ACTION_STATE_CHANGED) {
                    val state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                    handleBluetoothAdapterStateChange(state)
                }
            }
        }
        val filter = IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
        try {
            reactApplicationContext.registerReceiver(bluetoothStateReceiver, filter)
            isReceiverRegistered = true
            android.util.Log.i("OFFGRID_BLE", "Registered ACTION_STATE_CHANGED receiver successfully.")
        } catch (e: Exception) {
            android.util.Log.e("OFFGRID_BLE", "Failed to register Bluetooth state receiver", e)
        }
    }

    private synchronized fun unregisterBluetoothStateReceiver() {
        if (!isReceiverRegistered || bluetoothStateReceiver == null) return
        try {
            reactApplicationContext.unregisterReceiver(bluetoothStateReceiver)
            android.util.Log.i("OFFGRID_BLE", "Unregistered ACTION_STATE_CHANGED receiver.")
        } catch (_: Exception) {}
        bluetoothStateReceiver = null
        isReceiverRegistered = false
    }

    private fun handleBluetoothAdapterStateChange(state: Int) {
        when (state) {
            BluetoothAdapter.STATE_TURNING_OFF -> {
                android.util.Log.i("OFFGRID_BLE", "Bluetooth state: TURNING_OFF. Halting active BLE operations.")
                stopBleOperations()
                updateStatus(GatewayStatus.BLUETOOTH_DISABLED, "Bluetooth turning off")
            }
            BluetoothAdapter.STATE_OFF -> {
                android.util.Log.i("OFFGRID_BLE", "Bluetooth state: OFF.")
                stopBleOperations()
                updateStatus(GatewayStatus.BLUETOOTH_DISABLED, "Bluetooth disabled")
            }
            BluetoothAdapter.STATE_TURNING_ON -> {
                android.util.Log.i("OFFGRID_BLE", "Bluetooth state: TURNING_ON.")
                updateStatus(GatewayStatus.INITIALIZING, "Bluetooth enabling")
            }
            BluetoothAdapter.STATE_ON -> {
                android.util.Log.i("OFFGRID_BLE", "Bluetooth state: ON. Restoring gateway components.")
                advertiser = bluetoothAdapter?.bluetoothLeAdvertiser
                scanner = bluetoothAdapter?.bluetoothLeScanner
                setupGattServer()

                val newStatus = checkPermissionsAndAvailability()
                updateStatus(newStatus, "Bluetooth turned on")

                if (newStatus == GatewayStatus.READY && discoveryRequested && !isDiscoveryActive) {
                    android.util.Log.i("OFFGRID_BLE", "Authoritative auto-resuming discovery after Bluetooth re-enabled.")
                    startAdvertisingInternal()
                    startScanningInternal()
                    isDiscoveryActive = true
                }
            }
        }
    }

    private synchronized fun stopBleOperations() {
        activeAdvertiseCallback?.let {
            try {
                advertiser?.stopAdvertising(it)
                android.util.Log.i("OFFGRID_BLE", "Stopped active BLE advertising.")
            } catch (e: Exception) {
                android.util.Log.w("OFFGRID_BLE", "Error stopping advertising: ${e.message}")
            }
        }
        activeAdvertiseCallback = null

        activeScanCallback?.let {
            try {
                scanner?.stopScan(it)
                android.util.Log.i("OFFGRID_BLE", "Stopped active BLE scan.")
            } catch (e: Exception) {
                android.util.Log.w("OFFGRID_BLE", "Error stopping scan: ${e.message}")
            }
        }
        activeScanCallback = null

        isDiscoveryActive = false
        connectingAddresses.clear()

        // Disconnect and close existing client GATTs safely
        for ((peerId, gatt) in clientGatts) {
            try {
                gatt.disconnect()
                gatt.close()
            } catch (_: Exception) {}
        }
        clientGatts.clear()
        connectedClients.clear()
    }

    @ReactMethod
    fun initialize(publicKeyFingerprint: String, promise: Promise) {
        try {
            localPublicKeyFingerprint = publicKeyFingerprint
            registerBluetoothStateReceiver()

            val status = checkPermissionsAndAvailability()
            updateStatus(status, "initialize called")

            if (status == GatewayStatus.READY) {
                advertiser = bluetoothAdapter?.bluetoothLeAdvertiser
                scanner = bluetoothAdapter?.bluetoothLeScanner
                setupGattServer()
                isInitialized = true
            }

            val result = Arguments.createMap().apply {
                putString("status", status.name)
                putBoolean("isBluetoothEnabled", bluetoothAdapter?.isEnabled == true)
                putBoolean("isInitialized", isInitialized)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            android.util.Log.e("OFFGRID_BLE", "Failed during gateway initialization", e)
            updateStatus(GatewayStatus.ERROR, e.message)
            promise.reject("INITIALIZE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getGatewayStatus(promise: Promise) {
        val status = checkPermissionsAndAvailability()
        val result = Arguments.createMap().apply {
            putString("status", status.name)
            putBoolean("isBluetoothEnabled", bluetoothAdapter?.isEnabled == true)
            putBoolean("isInitialized", isInitialized)
            putBoolean("isDiscoveryActive", isDiscoveryActive)
        }
        promise.resolve(result)
    }

    private fun setupGattServer() {
        if (gattServer != null || bluetoothManager == null) return

        val serverCallback = object : BluetoothGattServerCallback() {
            override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
                try {
                    val addr = device.address ?: return
                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        connectedClients[addr] = device
                        android.util.Log.i("OFFGRID_BLE", "GATT server: client connected from $addr")
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        connectedClients.remove(addr)
                        android.util.Log.i("OFFGRID_BLE", "GATT server: client disconnected from $addr")
                        val disconnectMap = Arguments.createMap().apply {
                            putString("peerId", addr)
                        }
                        sendEvent("onPeerDisconnected", disconnectMap)
                    }
                } catch (e: Exception) {
                    android.util.Log.w("OFFGRID_BLE", "serverCallback onConnectionStateChange notice: ${e.message}")
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
                try {
                    if (value != null && value.isNotEmpty()) {
                        val base64Payload = Base64.encodeToString(value, Base64.NO_WRAP)
                        val msgMap = Arguments.createMap().apply {
                            putString("peerId", device.address ?: "UNKNOWN")
                            putString("payload", base64Payload)
                        }
                        sendEvent("onMessageReceived", msgMap)
                    }
                    if (responseNeeded) {
                        gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
                    }
                } catch (e: Exception) {
                    android.util.Log.w("OFFGRID_BLE", "serverCallback onCharacteristicWriteRequest notice: ${e.message}")
                }
            }

            override fun onDescriptorWriteRequest(
                device: BluetoothDevice,
                requestId: Int,
                descriptor: BluetoothGattDescriptor,
                preparedWrite: Boolean,
                responseNeeded: Boolean,
                offset: Int,
                value: ByteArray?
            ) {
                try {
                    if (responseNeeded) {
                        gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
                    }
                    val addr = device.address ?: return
                    connectedClients[addr] = device
                    android.util.Log.i("OFFGRID_BLE", "GATT server: CCCD notification subscription confirmed for $addr")
                    val peerMap = Arguments.createMap().apply {
                        putString("peerId", addr)
                        putString("transport", "BLE")
                        putDouble("discoveredAt", System.currentTimeMillis().toDouble())
                    }
                    sendEvent("onPeerDiscovered", peerMap)
                } catch (e: Exception) {
                    android.util.Log.w("OFFGRID_BLE", "serverCallback onDescriptorWriteRequest notice: ${e.message}")
                }
            }
        }

        try {
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

            // Attach standard Client Characteristic Configuration Descriptor (CCCD) for notification subscriptions
            val cccdDescriptor = BluetoothGattDescriptor(
                UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"),
                BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
            )
            transferChar.addDescriptor(cccdDescriptor)

            service.addCharacteristic(handshakeChar)
            service.addCharacteristic(transferChar)
            gattServer?.addService(service)
            android.util.Log.i("OFFGRID_BLE", "GATT server registered primary mesh service with CCCD descriptor.")
        } catch (e: Exception) {
            android.util.Log.e("OFFGRID_BLE", "Failed to setup GATT server", e)
        }
    }

    @ReactMethod
    fun startDiscovery(promise: Promise) {
        try {
            discoveryRequested = true
            val status = checkPermissionsAndAvailability()
            if (status != GatewayStatus.READY) {
                updateStatus(status, "startDiscovery rejected")
                promise.reject("GATEWAY_NOT_READY", "Gateway cannot start discovery in state: ${status.name}")
                return
            }

            if (isDiscoveryActive) {
                android.util.Log.i("OFFGRID_BLE", "startDiscovery: discovery already active, ignoring duplicate start.")
                promise.resolve(true)
                return
            }

            startAdvertisingInternal()
            startScanningInternal()
            isDiscoveryActive = true
            promise.resolve(true)
        } catch (e: Exception) {
            android.util.Log.e("OFFGRID_BLE", "startDiscovery error", e)
            promise.reject("DISCOVERY_ERROR", e.message, e)
        }
    }

    private synchronized fun startAdvertisingInternal() {
        val permStatus = checkOperationPermission("advertise")
        if (permStatus != GatewayStatus.READY && permStatus != GatewayStatus.BLUETOOTH_DISABLED) {
            android.util.Log.w("OFFGRID_BLE", "Cannot start advertising: permission status is ${permStatus.name}")
            return
        }

        if (advertiser == null) {
            advertiser = bluetoothAdapter?.bluetoothLeAdvertiser
        }
        if (advertiser == null) return

        // Stop prior advertising callback to prevent leaks
        activeAdvertiseCallback?.let {
            try {
                advertiser?.stopAdvertising(it)
            } catch (_: Exception) {}
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
        activeAdvertiseCallback = callback
        advertiser?.startAdvertising(settings, data, scanResponse, callback)
    }

    private synchronized fun startScanningInternal() {
        val permStatus = checkOperationPermission("scan")
        if (permStatus != GatewayStatus.READY && permStatus != GatewayStatus.BLUETOOTH_DISABLED) {
            android.util.Log.w("OFFGRID_BLE", "Cannot start scanning: permission status is ${permStatus.name}")
            return
        }

        if (scanner == null) {
            scanner = bluetoothAdapter?.bluetoothLeScanner
        }
        if (scanner == null) return

        // Stop prior scan callback to prevent duplicate scans
        activeScanCallback?.let {
            try {
                scanner?.stopScan(it)
            } catch (_: Exception) {}
        }

        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
            .build()

        val scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                try {
                    val device = result.device ?: return
                    val address = device.address ?: return

                    // MVP Constraint: Support one connected peer at a time
                    if (clientGatts.isNotEmpty() || connectedClients.isNotEmpty()) {
                        return
                    }

                    val isConnected = clientGatts.containsKey(address) || connectedClients.containsKey(address)
                    val isConnecting = connectingAddresses.contains(address)

                    if (!isConnected && !isConnecting) {
                        // Avoid dual-central collision: deterministic role negotiation
                        val serviceData = result.scanRecord?.getServiceData(ParcelUuid(SERVICE_UUID))
                        val peerFingerprint = serviceData?.let { String(it, Charsets.UTF_8) }
                        val myFingerprint = localPublicKeyFingerprint.take(8)

                        val shouldConnect = if (peerFingerprint != null && peerFingerprint != myFingerprint) {
                            myFingerprint > peerFingerprint
                        } else {
                            address.hashCode() > (bluetoothAdapter?.name?.hashCode() ?: 0)
                        }

                        // Notify UI that a nearby OFFGRID device was discovered
                        val peerMap = Arguments.createMap().apply {
                            putString("peerId", address)
                            putString("transport", "BLE")
                            putInt("rssi", result.rssi)
                            putDouble("discoveredAt", System.currentTimeMillis().toDouble())
                        }
                        sendEvent("onPeerDiscovered", peerMap)

                        if (shouldConnect) {
                            connectingAddresses.add(address)
                            android.util.Log.i("OFFGRID_BLE", "Role negotiation: Central role elected for $address. Connecting...")
                            connectInternal(device)
                        } else {
                            android.util.Log.i("OFFGRID_BLE", "Role negotiation: Peripheral role elected for $address. Awaiting incoming GATT connection.")
                        }
                    }
                } catch (e: Exception) {
                    android.util.Log.w("OFFGRID_BLE", "scanCallback onScanResult notice: ${e.message}")
                }
            }
        }
        activeScanCallback = scanCallback
        scanner?.startScan(listOf(filter), settings, scanCallback)
    }

    @ReactMethod
    fun stopDiscovery(promise: Promise) {
        try {
            discoveryRequested = false
            stopBleOperations()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_DISCOVERY_ERROR", e.message, e)
        }
    }

    private fun connectInternal(device: BluetoothDevice) {
        val peerId = device.address ?: return
        try {
            val gattCallback = object : BluetoothGattCallback() {
                override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                    try {
                        if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                            clientGatts[peerId] = gatt
                            connectingAddresses.remove(peerId)
                            android.util.Log.i("OFFGRID_BLE", "GATT connected to $peerId. Serialized Step 1: Requesting MTU 512...")

                            // Serialized Step 1: Request MTU 512
                            val mtuQueued = gatt.requestMtu(512)
                            if (!mtuQueued) {
                                // Fallback: If MTU request could not be queued, discover services immediately
                                gatt.discoverServices()
                            }
                        } else if (newState == BluetoothProfile.STATE_DISCONNECTED || status != BluetoothGatt.GATT_SUCCESS) {
                            android.util.Log.i("OFFGRID_BLE", "GATT disconnected from $peerId (status=$status, newState=$newState)")
                            clientGatts.remove(peerId)
                            connectingAddresses.remove(peerId)
                            try {
                                gatt.disconnect()
                                gatt.close()
                            } catch (_: Exception) {}
                            val disconnectMap = Arguments.createMap().apply {
                                putString("peerId", peerId)
                            }
                            sendEvent("onPeerDisconnected", disconnectMap)
                        }
                    } catch (e: Exception) {
                        android.util.Log.w("OFFGRID_BLE", "gattCallback onConnectionStateChange notice: ${e.message}")
                    }
                }

                override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
                    android.util.Log.i("OFFGRID_BLE", "MTU negotiated to $mtu (status=$status). Serialized Step 2: Discovering services...")
                    // Serialized Step 2: Discover services only after MTU negotiation completes
                    gatt.discoverServices()
                }

                override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                    try {
                        if (status == BluetoothGatt.GATT_SUCCESS) {
                            val service = gatt.getService(SERVICE_UUID)
                            val transferChar = service?.getCharacteristic(CHARACTERISTIC_TRANSFER)
                            if (transferChar != null) {
                                // Serialized Step 3: Enable notification locally
                                gatt.setCharacteristicNotification(transferChar, true)

                                // Serialized Step 4: Write CCCD descriptor to server
                                val cccd = transferChar.getDescriptor(UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"))
                                if (cccd != null) {
                                    cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                                    val writeQueued = gatt.writeDescriptor(cccd)
                                    android.util.Log.i("OFFGRID_BLE", "Serialized Step 4: Queued CCCD descriptor write: $writeQueued")
                                } else {
                                    val peerMap = Arguments.createMap().apply {
                                        putString("peerId", peerId)
                                        putString("transport", "BLE")
                                        putDouble("discoveredAt", System.currentTimeMillis().toDouble())
                                    }
                                    sendEvent("onPeerDiscovered", peerMap)
                                }
                            }
                        }
                    } catch (e: Exception) {
                        android.util.Log.w("OFFGRID_BLE", "gattCallback onServicesDiscovered notice: ${e.message}")
                    }
                }

                override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
                    android.util.Log.i("OFFGRID_BLE", "Serialized Step 5: CCCD descriptor write confirmed (status=$status). Bidirectional pipe READY!")
                    val peerMap = Arguments.createMap().apply {
                        putString("peerId", peerId)
                        putString("transport", "BLE")
                        putDouble("discoveredAt", System.currentTimeMillis().toDouble())
                    }
                    sendEvent("onPeerDiscovered", peerMap)
                }

                override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
                    try {
                        val value = characteristic.value
                        if (value != null && value.isNotEmpty()) {
                            val base64Payload = Base64.encodeToString(value, Base64.NO_WRAP)
                            val msgMap = Arguments.createMap().apply {
                                putString("peerId", peerId)
                                putString("payload", base64Payload)
                            }
                            sendEvent("onMessageReceived", msgMap)
                        }
                    } catch (e: Exception) {
                        android.util.Log.w("OFFGRID_BLE", "gattCallback onCharacteristicChanged notice: ${e.message}")
                    }
                }
            }

            val gatt = device.connectGatt(reactApplicationContext, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
            if (gatt == null) {
                connectingAddresses.remove(peerId)
            }
        } catch (_: Exception) {
            connectingAddresses.remove(peerId)
        }
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
            val rawBytes = Base64.decode(payloadBase64, Base64.NO_WRAP)

            // 1. Central role: write to remote GATT server
            val gatt = clientGatts[peerId]
            if (gatt != null) {
                val service = gatt.getService(SERVICE_UUID)
                val characteristic = service?.getCharacteristic(CHARACTERISTIC_TRANSFER)
                if (characteristic != null) {
                    characteristic.value = rawBytes
                    characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                    val success = gatt.writeCharacteristic(characteristic)
                    android.util.Log.i("OFFGRID_BLE", "send: wrote characteristic to clientGatt $peerId: $success")
                    promise.resolve(success)
                    return
                }
            }

            // 2. Peripheral role: notify to connected central client
            val clientDevice = connectedClients[peerId]
            if (clientDevice != null && gattServer != null) {
                val service = gattServer?.getService(SERVICE_UUID)
                val characteristic = service?.getCharacteristic(CHARACTERISTIC_TRANSFER)
                if (characteristic != null) {
                    characteristic.value = rawBytes
                    @Suppress("DEPRECATION")
                    val success = gattServer?.notifyCharacteristicChanged(clientDevice, characteristic, false) == true
                    android.util.Log.i("OFFGRID_BLE", "send: notified connectedClient $peerId: $success")
                    promise.resolve(success)
                    return
                }
            }

            promise.reject("PEER_NOT_CONNECTED", "Peer is not connected via Central or Peripheral GATT: $peerId")
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

            // 1. Broadcast to client GATTs (Central role)
            val deadGatts = mutableListOf<String>()
            for ((peerId, gatt) in clientGatts) {
                try {
                    val service = gatt.getService(SERVICE_UUID)
                    val characteristic = service?.getCharacteristic(CHARACTERISTIC_TRANSFER)
                    if (characteristic != null) {
                        characteristic.value = rawBytes
                        characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                        if (gatt.writeCharacteristic(characteristic)) {
                            sentCount++
                        }
                    }
                } catch (e: Exception) {
                    deadGatts.add(peerId)
                }
            }
            for (deadId in deadGatts) {
                clientGatts.remove(deadId)?.let {
                    try {
                        it.disconnect()
                        it.close()
                    } catch (_: Exception) {}
                }
            }

            // 2. Broadcast to connected server clients via notify (Peripheral role)
            gattServer?.let { server ->
                val service = server.getService(SERVICE_UUID)
                val characteristic = service?.getCharacteristic(CHARACTERISTIC_TRANSFER)
                if (characteristic != null) {
                    characteristic.value = rawBytes
                    for ((_, clientDevice) in connectedClients) {
                        try {
                            @Suppress("DEPRECATION")
                            if (server.notifyCharacteristicChanged(clientDevice, characteristic, false)) {
                                sentCount++
                            }
                        } catch (_: Exception) {}
                    }
                }
            }

            android.util.Log.i("OFFGRID_BLE", "broadcast: transmitted to $sentCount connections (clientGatts=${clientGatts.size}, connectedClients=${connectedClients.size})")
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

    // LifecycleEventListener implementation
    override fun onHostResume() {
        val newStatus = checkPermissionsAndAvailability()
        if (newStatus != currentStatus) {
            updateStatus(newStatus, "Host resumed")
            if (newStatus == GatewayStatus.READY && isInitialized) {
                advertiser = bluetoothAdapter?.bluetoothLeAdvertiser
                scanner = bluetoothAdapter?.bluetoothLeScanner
                setupGattServer()
                if (discoveryRequested && !isDiscoveryActive) {
                    android.util.Log.i("OFFGRID_BLE", "Authoritative discovery resume on host resume.")
                    startAdvertisingInternal()
                    startScanningInternal()
                    isDiscoveryActive = true
                }
            }
        }
    }

    override fun onHostPause() {
        // Maintain mesh discovery in background
    }

    override fun onHostDestroy() {
        android.util.Log.i("OFFGRID_BLE", "NativeMeshBridge onHostDestroy - releasing native resources.")
        reactApplicationContext.removeLifecycleEventListener(this)
        unregisterBluetoothStateReceiver()
        stopBleOperations()
        try {
            gattServer?.close()
        } catch (_: Exception) {}
        gattServer = null
        isInitialized = false
    }
}
