package com.offgrid

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.offgrid.crypto.KeystoreModule
import com.offgrid.location.LocationModule
import com.offgrid.battery.BatteryModule
import com.offgrid.mesh.NativeMeshBridge
import com.offgrid.db.OffgridSqliteModule

class OffgridPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(
            KeystoreModule(reactContext),
            LocationModule(reactContext),
            BatteryModule(reactContext),
            NativeMeshBridge(reactContext),
            OffgridSqliteModule(reactContext)
        )

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> = emptyList()
}
