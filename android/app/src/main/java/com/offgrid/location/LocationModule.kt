package com.offgrid.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class LocationModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "LocationModule"
        private const val LOCATION_TIMEOUT_MS = 10000L
    }

    override fun getName(): String = NAME

    @Suppress("DEPRECATION")
    private fun isMockLocation(location: Location): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            location.isMock
        } else {
            location.isFromMockProvider
        }
    }

    @SuppressLint("MissingPermission")
    @ReactMethod
    fun getCurrentLocation(promise: Promise) {
        val context = reactApplicationContext
        val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager

        if (locationManager == null) {
            val res = Arguments.createMap().apply {
                putNull("latitude")
                putNull("longitude")
                putNull("accuracyM")
                putNull("timestamp")
                putBoolean("isMock", false)
                putString("provider", "none")
                putString("status", "UNAVAILABLE")
            }
            promise.resolve(res)
            return
        }

        try {
            val isGpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
            val isNetworkEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)

            // 1. First check best available last known location across all providers
            val lastLocation = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                ?: (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) locationManager.getLastKnownLocation(LocationManager.FUSED_PROVIDER) else null)
                ?: locationManager.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER)

            if (lastLocation != null) {
                val isMock = isMockLocation(lastLocation)
                val status = if (isMock) {
                    "MOCK"
                } else if (lastLocation.accuracy > 150.0f) {
                    "LOW_ACCURACY"
                } else {
                    "AVAILABLE"
                }

                val res = Arguments.createMap().apply {
                    putDouble("latitude", lastLocation.latitude)
                    putDouble("longitude", lastLocation.longitude)
                    putDouble("accuracyM", lastLocation.accuracy.toDouble())
                    putDouble("timestamp", lastLocation.time.toDouble())
                    putBoolean("isMock", isMock)
                    putString("provider", lastLocation.provider ?: "last_known")
                    putString("status", status)
                }
                promise.resolve(res)
                return
            }

            if (!isGpsEnabled && !isNetworkEnabled) {
                val res = Arguments.createMap().apply {
                    putNull("latitude")
                    putNull("longitude")
                    putNull("accuracyM")
                    putNull("timestamp")
                    putBoolean("isMock", false)
                    putString("provider", "disabled")
                    putString("status", "UNAVAILABLE")
                }
                promise.resolve(res)
                return
            }

            // 2. Request fresh updates from available providers with timeout
            var hasResolved = false
            val handler = android.os.Handler(Looper.getMainLooper())

            val listener = object : LocationListener {
                override fun onLocationChanged(loc: Location) {
                    if (hasResolved) return
                    hasResolved = true
                    handler.removeCallbacksAndMessages(null)
                    try { locationManager.removeUpdates(this) } catch (_: Exception) {}

                    val isMock = isMockLocation(loc)
                    val status = if (isMock) {
                        "MOCK"
                    } else if (loc.accuracy > 150.0f) {
                        "LOW_ACCURACY"
                    } else {
                        "AVAILABLE"
                    }

                    val res = Arguments.createMap().apply {
                        putDouble("latitude", loc.latitude)
                        putDouble("longitude", loc.longitude)
                        putDouble("accuracyM", loc.accuracy.toDouble())
                        putDouble("timestamp", loc.time.toDouble())
                        putBoolean("isMock", isMock)
                        putString("provider", loc.provider ?: "fresh")
                        putString("status", status)
                    }
                    promise.resolve(res)
                }

                @Deprecated("Deprecated in Java")
                override fun onStatusChanged(p: String?, status: Int, extras: Bundle?) {}
                override fun onProviderEnabled(p: String) {}
                override fun onProviderDisabled(p: String) {}
            }

            handler.postDelayed({
                if (!hasResolved) {
                    hasResolved = true
                    try { locationManager.removeUpdates(listener) } catch (_: Exception) {}
                    val res = Arguments.createMap().apply {
                        putNull("latitude")
                        putNull("longitude")
                        putNull("accuracyM")
                        putNull("timestamp")
                        putBoolean("isMock", false)
                        putString("provider", "timeout")
                        putString("status", "UNAVAILABLE")
                    }
                    promise.resolve(res)
                }
            }, LOCATION_TIMEOUT_MS)

            if (isNetworkEnabled) {
                locationManager.requestSingleUpdate(LocationManager.NETWORK_PROVIDER, listener, Looper.getMainLooper())
            }
            if (isGpsEnabled) {
                locationManager.requestSingleUpdate(LocationManager.GPS_PROVIDER, listener, Looper.getMainLooper())
            }
        } catch (e: Exception) {
            val res = Arguments.createMap().apply {
                putNull("latitude")
                putNull("longitude")
                putNull("accuracyM")
                putNull("timestamp")
                putBoolean("isMock", false)
                putString("provider", "error")
                putString("status", "UNAVAILABLE")
            }
            promise.resolve(res)
        }
    }
}
