package expo.modules.nearbyconnections

import android.util.Base64
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap

/**
 * Thin bridge to Google Nearby Connections (Strategy.P2P_STAR). It moves opaque byte frames only:
 * enrollment, signatures, ordering and permissions all live in the JS core. Frames cross the bridge as base64.
 * Connections are auto-accepted here because the JS layer authenticates every peer cryptographically
 * (signed enrollment certificate / challenge), and the Nearby authentication digits are surfaced for optional comparison.
 */
class NearbyConnectionsModule : Module() {
  private val client: ConnectionsClient
    get() = Nearby.getConnectionsClient(appContext.reactContext ?: throw CodedException("no_context", "React context is not available", null))

  private val discovered = ConcurrentHashMap<String, String>()          // endpointName -> endpointId
  private val waiters = ConcurrentHashMap<String, MutableList<Promise>>() // endpointName -> pending connect() promises
  private val pendingConnect = ConcurrentHashMap<String, Promise>()     // endpointId -> connect() promise awaiting result
  private var localName = "device"

  private val payloadCallback = object : PayloadCallback() {
    override fun onPayloadReceived(endpointId: String, payload: Payload) {
      val bytes = payload.asBytes() ?: return
      sendEvent("onFrame", mapOf("peerId" to endpointId, "data" to Base64.encodeToString(bytes, Base64.NO_WRAP)))
    }
    override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {}
  }

  private val lifecycle = object : ConnectionLifecycleCallback() {
    override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
      sendEvent("onPeer", mapOf("peerId" to endpointId, "state" to "connecting"))
      sendEvent("onAuthDigits", mapOf("peerId" to endpointId, "digits" to info.authenticationDigits))
      client.acceptConnection(endpointId, payloadCallback)
    }
    override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
      val ok = result.status.statusCode == ConnectionsStatusCodes.STATUS_OK
      sendEvent("onPeer", mapOf("peerId" to endpointId, "state" to if (ok) "connected" else "disconnected"))
      val p = pendingConnect.remove(endpointId)
      if (ok) p?.resolve(endpointId) else p?.reject(CodedException("connect_failed", "Connection failed: ${result.status.statusCode}", null))
    }
    override fun onDisconnected(endpointId: String) {
      sendEvent("onPeer", mapOf("peerId" to endpointId, "state" to "disconnected"))
    }
  }

  private val discovery = object : EndpointDiscoveryCallback() {
    override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
      discovered[info.endpointName] = endpointId
      waiters.remove(info.endpointName)?.forEach { requestTo(endpointId, it) }
    }
    override fun onEndpointLost(endpointId: String) {
      discovered.entries.removeIf { it.value == endpointId }
    }
  }

  private fun requestTo(endpointId: String, promise: Promise) {
    pendingConnect[endpointId] = promise
    client.requestConnection(localName, endpointId, lifecycle)
      .addOnFailureListener { e ->
        val p = pendingConnect.remove(endpointId)
        // Already linked to this endpoint: that is success for us (the JS layer sends HELLO on the "connected" event).
        if ((e as? ApiException)?.statusCode == ConnectionsStatusCodes.STATUS_ALREADY_CONNECTED_TO_ENDPOINT) {
          sendEvent("onPeer", mapOf("peerId" to endpointId, "state" to "connected")); p?.resolve(endpointId)
        } else p?.reject(CodedException("request_failed", "${e.message ?: "requestConnection failed"} (${(e as? ApiException)?.statusCode ?: "?"})", e))
      }
  }

  override fun definition() = ModuleDefinition {
    Name("NearbyConnections")
    Events("onFrame", "onPeer", "onAuthDigits")

    /** role: "parent" advertises, "child" discovers. */
    AsyncFunction("start") { role: String, serviceId: String, name: String, promise: Promise ->
      localName = name
      val strategy = Strategy.P2P_STAR
      val c = client
      // Restart cleanly: a second start without stopping fails with ALREADY_ADVERTISING / ALREADY_DISCOVERING.
      val task = if (role == "parent") {
        c.stopAdvertising()
        c.startAdvertising(name, serviceId, lifecycle, AdvertisingOptions.Builder().setStrategy(strategy).build())
      } else {
        c.stopDiscovery(); discovered.clear()
        c.startDiscovery(serviceId, discovery, DiscoveryOptions.Builder().setStrategy(strategy).build())
      }
      task.addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { e ->
          val code = (e as? ApiException)?.statusCode
          if (code == ConnectionsStatusCodes.STATUS_ALREADY_ADVERTISING || code == ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING) promise.resolve(null)
          else promise.reject(CodedException("start_failed", "${e.message ?: "start failed"} (${code ?: "?"})", e))
        }
    }

    /** Child: connect to the Parent advertising `endpointName`; waits for discovery up to timeoutMs. */
    AsyncFunction("connect") { endpointName: String, timeoutMs: Int, promise: Promise ->
      val id = discovered[endpointName]
      if (id != null) { requestTo(id, promise); return@AsyncFunction }
      waiters.getOrPut(endpointName) { java.util.Collections.synchronizedList(mutableListOf()) }.add(promise)
      android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
        if (waiters[endpointName]?.remove(promise) == true) promise.reject(CodedException("endpoint_not_found", "Parent not found nearby", null))
      }, timeoutMs.toLong())
    }

    AsyncFunction("send") { peerId: String, data: String, promise: Promise ->
      val bytes = Base64.decode(data, Base64.NO_WRAP)
      client.sendPayload(peerId, Payload.fromBytes(bytes))
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { e -> promise.reject(CodedException("send_failed", e.message ?: "send failed", e)) }
    }

    AsyncFunction("disconnect") { peerId: String -> client.disconnectFromEndpoint(peerId) }

    AsyncFunction("stop") {
      val c = client
      c.stopAdvertising(); c.stopDiscovery(); c.stopAllEndpoints()
      discovered.clear(); waiters.clear(); pendingConnect.clear()
    }

    OnDestroy {
      try { val c = client; c.stopAdvertising(); c.stopDiscovery(); c.stopAllEndpoints() } catch (_: Throwable) {}
    }
  }
}
