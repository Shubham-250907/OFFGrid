package com.offgrid

import android.app.Application
import android.util.Log
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.shell.MainReactPackage
import com.facebook.soloader.SoLoader
import java.io.File

class MainApplication : Application(), ReactApplication {

    private val mReactNativeHost = object : DefaultReactNativeHost(this) {
        override fun getUseDeveloperSupport(): Boolean = false

        override fun getPackages(): List<ReactPackage> = listOf(
            MainReactPackage(),
            OffgridPackage()
        )

        override fun getJSMainModuleName(): String = "index"

        override val isHermesEnabled: Boolean = true
        override val isNewArchEnabled: Boolean = false
    }

    override val reactNativeHost: ReactNativeHost
        get() = mReactNativeHost

    override fun onCreate() {
        super.onCreate()

        // Global crash logger that captures any fatal exception to disk and logcat
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e("OFFGRID_CRASH", "FATAL UNCAUGHT EXCEPTION on thread ${thread.name}", throwable)
            try {
                val dir = getExternalFilesDir(null) ?: filesDir
                val crashFile = File(dir, "crash_log.txt")
                crashFile.writeText(
                    "OFFGRID FATAL CRASH\n" +
                    "Time: ${System.currentTimeMillis()}\n" +
                    "Thread: ${thread.name}\n\n" +
                    Log.getStackTraceString(throwable)
                )
            } catch (_: Exception) {}
            defaultHandler?.uncaughtException(thread, throwable)
        }

        SoLoader.init(this, false)
    }
}
