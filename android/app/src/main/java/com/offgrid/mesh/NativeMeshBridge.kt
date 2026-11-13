package com.offgrid.mesh

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class NativeMeshBridge(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NativeMeshBridge"
    }

    override fun getName(): String = NAME

    private fun sendEvent(eventName: String, params: Any?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun initialize(promise: Promise) {
        // Native radio initialization hook
        promise.resolve(true)
    }

    @ReactMethod
    fun startDiscovery(promise: Promise) {
        // BLE & Wi-Fi Direct discovery invocation
        promise.resolve(true)
    }

    @ReactMethod
    fun stopDiscovery(promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun connect(peerId: String, promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun disconnect(peerId: String, promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun send(peerId: String, payloadBase64: String, priority: Int, promise: Promise) {
        // Priority packet queuing for point-to-point transmission
        promise.resolve(true)
    }

    @ReactMethod
    fun broadcast(payloadBase64: String, priority: Int, promise: Promise) {
        // BLE beacon advertisement / Wi-Fi multicast broadcast
        promise.resolve(true)
    }

    // Required for React Native event emitter listeners
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
