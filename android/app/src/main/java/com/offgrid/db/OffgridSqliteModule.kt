package com.offgrid.db

import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteStatement
import android.util.Base64
import com.facebook.react.bridge.*

class OffgridSqliteModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    @Volatile
    private var dbInstance: SQLiteDatabase? = null

    override fun getName(): String = "OffgridSqlite"

    private fun getDb(): SQLiteDatabase {
        return dbInstance ?: synchronized(this) {
            dbInstance ?: run {
                val db = reactContext.openOrCreateDatabase("offgrid.db", Context.MODE_PRIVATE, null)
                db.execSQL("PRAGMA foreign_keys = ON;")
                dbInstance = db
                db
            }
        }
    }

    private fun bindParams(stmt: SQLiteStatement, params: ReadableArray) {
        for (i in 0 until params.size()) {
            val index = i + 1
            when (params.getType(i)) {
                ReadableType.Null -> stmt.bindNull(index)
                ReadableType.Boolean -> stmt.bindLong(index, if (params.getBoolean(i)) 1L else 0L)
                ReadableType.Number -> {
                    val d = params.getDouble(i)
                    if (d == Math.floor(d) && !d.isInfinite() && !d.isNaN()) {
                        stmt.bindLong(index, d.toLong())
                    } else {
                        stmt.bindDouble(index, d)
                    }
                }
                ReadableType.String -> stmt.bindString(index, params.getString(i))
                else -> stmt.bindString(index, params.getString(i))
            }
        }
    }

    private fun splitSqlStatements(sql: String): List<String> {
        val statements = mutableListOf<String>()
        val sb = StringBuilder()
        var inSingleQuote = false
        var inDoubleQuote = false
        var inLineComment = false
        var inBlockComment = false

        var i = 0
        while (i < sql.length) {
            val c = sql[i]
            val nextC = if (i + 1 < sql.length) sql[i + 1] else ' '

            if (inLineComment) {
                if (c == '\n' || c == '\r') {
                    inLineComment = false
                }
            } else if (inBlockComment) {
                if (c == '*' && nextC == '/') {
                    inBlockComment = false
                    i++
                }
            } else if (inSingleQuote) {
                if (c == '\'') {
                    inSingleQuote = false
                }
                sb.append(c)
            } else if (inDoubleQuote) {
                if (c == '"') {
                    inDoubleQuote = false
                }
                sb.append(c)
            } else {
                if (c == '-' && nextC == '-') {
                    inLineComment = true
                    i++
                } else if (c == '/' && nextC == '*') {
                    inBlockComment = true
                    i++
                } else if (c == '\'') {
                    inSingleQuote = true
                    sb.append(c)
                } else if (c == '"') {
                    inDoubleQuote = true
                    sb.append(c)
                } else if (c == ';') {
                    val trimmed = sb.toString().trim()
                    if (trimmed.isNotEmpty()) {
                        statements.add(trimmed)
                    }
                    sb.setLength(0)
                } else {
                    sb.append(c)
                }
            }
            i++
        }

        val remainder = sb.toString().trim()
        if (remainder.isNotEmpty()) {
            statements.add(remainder)
        }
        return statements
    }

    @ReactMethod
    fun execRaw(sql: String, promise: Promise) {
        synchronized(this) {
            try {
                val db = getDb()
                val statements = splitSqlStatements(sql)
                for (statement in statements) {
                    if (statement.isNotEmpty()) {
                        db.execSQL(statement)
                    }
                }
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("SQL_EXEC_RAW_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun execute(sql: String, params: ReadableArray?, promise: Promise) {
        synchronized(this) {
            try {
                val db = getDb()
                val stmt = db.compileStatement(sql)
                try {
                    if (params != null) {
                        bindParams(stmt, params)
                    }
                    val trimmed = sql.trim().uppercase()
                    if (trimmed.startsWith("INSERT")) {
                        val insertId = stmt.executeInsert()
                        val result = Arguments.createMap().apply {
                            putInt("rowsAffected", if (insertId >= 0) 1 else 0)
                            putDouble("insertId", insertId.toDouble())
                        }
                        promise.resolve(result)
                    } else if (trimmed.startsWith("UPDATE") || trimmed.startsWith("DELETE")) {
                        val affected = stmt.executeUpdateDelete()
                        val result = Arguments.createMap().apply {
                            putInt("rowsAffected", affected)
                        }
                        promise.resolve(result)
                    } else {
                        stmt.execute()
                        val result = Arguments.createMap().apply {
                            putInt("rowsAffected", 0)
                        }
                        promise.resolve(result)
                    }
                } finally {
                    stmt.close()
                }
            } catch (e: Exception) {
                promise.reject("SQL_EXECUTE_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun query(sql: String, params: ReadableArray?, promise: Promise) {
        synchronized(this) {
            try {
                val db = getDb()
                val stringArgs: Array<String?>? = if (params != null && params.size() > 0) {
                    Array(params.size()) { i ->
                        when (params.getType(i)) {
                            ReadableType.Null -> null
                            ReadableType.Boolean -> if (params.getBoolean(i)) "1" else "0"
                            ReadableType.Number -> {
                                val d = params.getDouble(i)
                                if (d == Math.floor(d) && !d.isInfinite() && !d.isNaN()) {
                                    d.toLong().toString()
                                } else {
                                    d.toString()
                                }
                            }
                            ReadableType.String -> params.getString(i)
                            else -> params.getString(i)
                        }
                    }
                } else {
                    null
                }

                val cursor: Cursor = db.rawQuery(sql, stringArgs)
                val rows = Arguments.createArray()
                val colNames = cursor.columnNames
                val colCount = cursor.columnCount
                try {
                    while (cursor.moveToNext()) {
                        val row = Arguments.createMap()
                        for (i in 0 until colCount) {
                            val name = colNames[i]
                            when (cursor.getType(i)) {
                                Cursor.FIELD_TYPE_NULL -> row.putNull(name)
                                Cursor.FIELD_TYPE_INTEGER -> row.putDouble(name, cursor.getLong(i).toDouble())
                                Cursor.FIELD_TYPE_FLOAT -> row.putDouble(name, cursor.getDouble(i))
                                Cursor.FIELD_TYPE_STRING -> row.putString(name, cursor.getString(i))
                                Cursor.FIELD_TYPE_BLOB -> {
                                    val bytes = cursor.getBlob(i)
                                    if (bytes != null) {
                                        row.putString(name, Base64.encodeToString(bytes, Base64.NO_WRAP))
                                    } else {
                                        row.putNull(name)
                                    }
                                }
                            }
                        }
                        rows.pushMap(row)
                    }
                } finally {
                    cursor.close()
                }
                promise.resolve(rows)
            } catch (e: Exception) {
                promise.reject("SQL_QUERY_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun beginTransaction(promise: Promise) {
        synchronized(this) {
            try {
                getDb().beginTransaction()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("SQL_TX_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun commitTransaction(promise: Promise) {
        synchronized(this) {
            try {
                val db = getDb()
                db.setTransactionSuccessful()
                db.endTransaction()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("SQL_TX_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun rollbackTransaction(promise: Promise) {
        synchronized(this) {
            try {
                val db = getDb()
                if (db.inTransaction()) {
                    db.endTransaction()
                }
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("SQL_TX_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun close(promise: Promise) {
        synchronized(this) {
            try {
                dbInstance?.let {
                    if (it.isOpen) {
                        it.close()
                    }
                }
                dbInstance = null
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("SQL_CLOSE_ERROR", e.message, e)
            }
        }
    }
}
