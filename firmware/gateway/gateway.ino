#include "painlessMesh.h"
#include <ArduinoJson.h>
#include <vector>

// =========================================================================
// 1. NODE CONFIGURATION
// *** CHANGE THIS SINGLE CHARACTER FOR EACH BOARD! ***
// =========================================================================
#define MY_NODE_ID 'E'  // Options: 'A', 'B', 'C', 'D', 'E'

// =========================================================================
// AUTO-DERIVED CONFIGURATION BASED ON MY_NODE_ID
// =========================================================================
#if MY_NODE_ID == 'E'
  #define IS_GATEWAY true
  #define MY_NODE_ROLE "Central Hospital E"
#elif MY_NODE_ID == 'A'
  #define IS_GATEWAY false
  #define MY_NODE_ROLE "Local Clinic A"
#elif MY_NODE_ID == 'B'
  #define IS_GATEWAY false
  #define MY_NODE_ROLE "Local Clinic B"
#elif MY_NODE_ID == 'C'
  #define IS_GATEWAY false
  #define MY_NODE_ROLE "Civilian Shelter C"
#elif MY_NODE_ID == 'D'
  #define IS_GATEWAY false
  #define MY_NODE_ROLE "Civilian Shelter D"
#else
  #error "Invalid MY_NODE_ID. Must be 'A', 'B', 'C', 'D', or 'E'."
#endif

// Mesh Network Credentials (MUST match all nodes exactly)
#define MESH_PREFIX     "DisasterMesh"
#define MESH_PASSWORD   "Rescue1234"
#define MESH_PORT       5555

Scheduler userScheduler;
painlessMesh  mesh;

// =========================================================================
// STATE VARIABLES & MEMORY STRUCTURES
// =========================================================================
bool isEmergencyMode = false;

// Address Mapping Table: Maps 'A'-'E' to 32-bit painlessMesh node IDs
uint32_t nodeIdMap[5] = {0, 0, 0, 0, 0};

// Static Routing Table: Maps destination node index ('A'-'E') to next-hop node letter
char routingTable[5] = {'?', '?', '?', '?', '?'};

// =========================================================================
// RESEARCH FEATURE: PRIORITY QUEUE SCHEDULER
// =========================================================================
struct QueuedPacket {
  String message;
  uint32_t nextHopId; // 0 for Broadcast
  String priority;    // "EMERGENCY", "SYSTEM", "ROUTINE"
  unsigned long timestamp;
};

std::vector<QueuedPacket> packetQueue;

int getPriorityWeight(String p) {
  if (p == "EMERGENCY") return 3;
  if (p == "SYSTEM") return 2;
  if (p == "ROUTINE") return 1;
  return 0;
}

void queuePacket(String msg, uint32_t nextHopId, String priority) {
  // Cap the queue size to 30 packets to prevent out-of-memory heap issues
  if (packetQueue.size() >= 30) {
    // Drop the lowest priority packet to make space
    int lowestIdx = -1;
    int lowestWeight = 999;
    for (size_t i = 0; i < packetQueue.size(); i++) {
      int w = getPriorityWeight(packetQueue[i].priority);
      if (w < lowestWeight) {
        lowestWeight = w;
        lowestIdx = i;
      }
    }
    if (lowestIdx != -1) {
      packetQueue.erase(packetQueue.begin() + lowestIdx);
    }
  }
  
  QueuedPacket pkt = {msg, nextHopId, priority, millis()};
  packetQueue.push_back(pkt);
}

void dispatchQueue() {
  if (packetQueue.empty()) return;

  // Find the index of the highest priority packet
  int bestIdx = 0;
  int bestWeight = -1;
  for (size_t i = 0; i < packetQueue.size(); i++) {
    int w = getPriorityWeight(packetQueue[i].priority);
    if (w > bestWeight) {
      bestWeight = w;
      bestIdx = i;
    }
  }

  // Extract and send the packet
  QueuedPacket pkt = packetQueue[bestIdx];
  packetQueue.erase(packetQueue.begin() + bestIdx);

  if (pkt.nextHopId != 0) {
    mesh.sendSingle(pkt.nextHopId, pkt.message);
  } else {
    mesh.sendBroadcast(pkt.message);
  }
}

// =========================================================================
// TASK DECLARATIONS & SCHEDULER
// =========================================================================
void sendHeartbeat();
void sendPing();
void triggerRoutineMessage();

Task heartbeatTask(5000, TASK_FOREVER, &sendHeartbeat);
Task pingTask(5000, TASK_FOREVER, &sendPing);
Task routineTask(10000, TASK_FOREVER, &triggerRoutineMessage);
Task queueDispatcherTask(150, TASK_FOREVER, &dispatchQueue); // Dispatch queue every 150ms

// Forward declarations
void forwardPacket(DynamicJsonDocument &doc);
void triggerEmergency();
void triggerNormalMode();
void handleSerialInput();

// =========================================================================
// TELEMETRY & MESSAGE LOGIC
// =========================================================================

void sendHeartbeat() {
  DynamicJsonDocument doc(1024);
  doc["id"] = String(MY_NODE_ID) + "_HB_" + String(millis());
  doc["type"] = "HEARTBEAT";
  doc["source"] = String(MY_NODE_ID);
  doc["destination"] = "ALL";
  doc["nextHop"] = "ALL";
  doc["priority"] = "ROUTINE";
  doc["timestamp"] = millis();

  JsonObject payload = doc.createNestedObject("payload");
  payload["battery"] = 98; // Simulated battery percentage
  payload["rssi"] = 0;     // Placeholders, will be updated by receiver
  payload["chipId"] = mesh.getNodeId();

  String msg;
  serializeJson(doc, msg);
  queuePacket(msg, 0, "ROUTINE");
}

void sendPing() {
  DynamicJsonDocument doc(1024);
  doc["id"] = String(MY_NODE_ID) + "_PNG_" + String(millis());
  doc["type"] = "PING";
  doc["source"] = String(MY_NODE_ID);
  doc["destination"] = "ALL"; // Broadcast ping to measure all direct links
  doc["nextHop"] = "ALL";
  doc["priority"] = "SYSTEM";
  doc["timestamp"] = millis();

  String msg;
  serializeJson(doc, msg);
  queuePacket(msg, 0, "SYSTEM");
}

void triggerRoutineMessage() {
  if (isEmergencyMode) return;
  if (IS_GATEWAY) return; // Gateway does not generate routine traffic

  // Pick a random peer target node ('A' to 'D') that is not ourselves
  char targets[] = {'A', 'B', 'C', 'D'};
  char targetNode;
  do {
    targetNode = targets[random(0, 4)];
  } while (targetNode == MY_NODE_ID);

  DynamicJsonDocument doc(1024);
  doc["id"] = String(MY_NODE_ID) + "_RT_" + String(millis());
  doc["type"] = "ROUTINE";
  doc["source"] = String(MY_NODE_ID);
  doc["destination"] = String(targetNode);
  doc["nextHop"] = "?"; // Determined dynamically by forwardPacket
  doc["priority"] = "ROUTINE";
  doc["timestamp"] = millis();

  JsonObject payload = doc.createNestedObject("payload");
  payload["text"] = "Routine logistics/resource update from " + String(MY_NODE_ROLE);

  forwardPacket(doc);
}

void triggerEmergency() {
  isEmergencyMode = true;
  DynamicJsonDocument doc(1024);
  doc["id"] = String(MY_NODE_ID) + "_EM_" + String(millis());
  doc["type"] = "EMERGENCY";
  doc["source"] = String(MY_NODE_ID);
  doc["destination"] = "E"; // Emergency always routes towards the gateway E
  doc["nextHop"] = "?";
  doc["priority"] = "EMERGENCY";
  doc["timestamp"] = millis();

  JsonObject payload = doc.createNestedObject("payload");
  payload["text"] = "SOS! Immediate assistance requested at " + String(MY_NODE_ROLE) + "!";

  forwardPacket(doc);
  Serial.printf("[SYSTEM] EMERGENCY MODE ACTIVE: Dispatching SOS to Gateway E.\n");
}

void triggerNormalMode() {
  isEmergencyMode = false;
  DynamicJsonDocument doc(1024);
  doc["id"] = String(MY_NODE_ID) + "_NM_" + String(millis());
  doc["type"] = "SYSTEM";
  doc["source"] = String(MY_NODE_ID);
  doc["destination"] = "E";
  doc["nextHop"] = "?";
  doc["priority"] = "SYSTEM";
  doc["timestamp"] = millis();

  JsonObject payload = doc.createNestedObject("payload");
  payload["text"] = "Emergency status resolved at " + String(MY_NODE_ROLE);

  forwardPacket(doc);
  Serial.printf("[SYSTEM] NORMAL MODE ACTIVE: Emergency resolved.\n");
}

// =========================================================================
// ROUTING LAYER: FORWARDING LOGIC
// =========================================================================

void forwardPacket(DynamicJsonDocument &doc) {
  String destStr = doc["destination"];
  if (destStr.length() != 1) return;
  char destChar = destStr.charAt(0);
  if (destChar < 'A' || destChar > 'E') return;

  // Retrieve assigned next hop from our local table
  char nextHopChar = routingTable[destChar - 'A'];
  String priority = doc["priority"];
  if (priority == "") priority = "ROUTINE";

  // If no route has been configured by the backend yet, fall back to broadcast
  if (nextHopChar == '?') {
    doc["nextHop"] = "ALL";
    String msg;
    serializeJson(doc, msg);
    queuePacket(msg, 0, priority);
    return;
  }

  doc["nextHop"] = String(nextHopChar);
  String msg;
  serializeJson(doc, msg);

  uint32_t nextHop32Id = nodeIdMap[nextHopChar - 'A'];
  queuePacket(msg, nextHop32Id, priority);
  
  #if !IS_GATEWAY
    Serial.printf("[FORWARD QUEUED] Added %s packet for %c to queue (Next hop: %c)\n", priority.c_str(), destChar, nextHopChar);
  #endif
}

// =========================================================================
// MESH CONNECTION DIAGNOSTIC CALLBACKS
// =========================================================================
void newConnectionCallback(uint32_t nodeId) {
  Serial.printf("[MESH] NEW_CONNECTION: Node joined mesh with ID = %u\n", nodeId);
}

void changedConnectionCallback() {
  Serial.printf("[MESH] CONNECTION_CHANGED: Topology updated. Active nodes: %u\n", mesh.getNodeList().size() + 1);
}

void nodeTimeAdjustedCallback(int32_t offset) {
  Serial.printf("[MESH] TIME_SYNCHRONIZED: Clock adjusted by offset = %d ms\n", offset);
}

// =========================================================================
// MESH PACKET RECEIVE HANDLER
// =========================================================================

void receivedCallback(uint32_t from, String &msg) {
  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, msg);
  if (error) return;

  String type = doc["type"];
  String sourceStr = doc["source"];
  if (sourceStr.length() != 1) return;
  char sourceChar = sourceStr.charAt(0);

  // Maintain address mapping mapping 'A'-'E' to painlessMesh 32-bit IDs
  if (sourceChar >= 'A' && sourceChar <= 'E') {
    nodeIdMap[sourceChar - 'A'] = from;
  }

  // Gateway logic: forward all received packets to the Python backend via Serial
  #if IS_GATEWAY
    // Populate link quality metrics (RSSI) if available
    int rssi = mesh.getLinkRSSI(from);
    doc["payload"]["rssi"] = rssi;
    serializeJson(doc, Serial);
    Serial.println();
  #endif

  String nextHopStr = doc["nextHop"];
  String destStr = doc["destination"];

  // Process packet if it is meant for us (directly unicast or broadcasted)
  bool isForUs = (nextHopStr == "ALL" || nextHopStr == String(MY_NODE_ID));

  if (isForUs) {
    if (destStr == String(MY_NODE_ID)) {
      
      // Handle ROUTE configuration command
      if (type == "SET_ROUTE") {
        String destCharStr = doc["payload"]["dest"];
        String nextCharStr = doc["payload"]["next"];
        if (destCharStr.length() == 1 && nextCharStr.length() == 1) {
          char destChar = destCharStr.charAt(0);
          char nextChar = nextCharStr.charAt(0);
          if (destChar >= 'A' && destChar <= 'E' && nextChar >= 'A' && nextChar <= 'E') {
            routingTable[destChar - 'A'] = nextChar;
            #if !IS_GATEWAY
              Serial.printf("[CONFIG] Route Updated: To reach %c, send to next-hop %c\n", destChar, nextChar);
            #endif
          }
        }
      }
      // Handle MODE configuration command
      else if (type == "SET_MODE") {
        String modeStr = doc["payload"]["mode"];
        if (modeStr == "EMERGENCY") {
          isEmergencyMode = true;
          #if !IS_GATEWAY
            Serial.println("[CONFIG] Mode set to EMERGENCY");
          #endif
        } else if (modeStr == "NORMAL") {
          isEmergencyMode = false;
          #if !IS_GATEWAY
            Serial.println("[CONFIG] Mode set to NORMAL");
          #endif
        }
      }
      // Respond to PING packets
      else if (type == "PING") {
        unsigned long origTime = doc["timestamp"];
        DynamicJsonDocument reply(1024);
        reply["id"] = String(MY_NODE_ID) + "_PNG_REPLY_" + String(millis());
        reply["type"] = "PONG";
        reply["source"] = String(MY_NODE_ID);
        reply["destination"] = sourceStr;
        reply["nextHop"] = sourceStr;
        reply["priority"] = "SYSTEM";
        reply["timestamp"] = millis();

        JsonObject payload = reply.createNestedObject("payload");
        payload["sentTime"] = origTime;

        String replyMsg;
        serializeJson(reply, replyMsg);

        uint32_t destId = nodeIdMap[sourceChar - 'A'];
        queuePacket(replyMsg, destId, "SYSTEM");
      }
      // Process PONG replies and calculate latency
      else if (type == "PONG") {
        unsigned long sentTime = doc["payload"]["sentTime"];
        unsigned long rtt = millis() - sentTime;

        #if !IS_GATEWAY
          Serial.printf("[METRICS] Round-trip latency to %c: %lu ms\n", sourceChar, rtt);

          // Report link RTT metrics to the Gateway
          DynamicJsonDocument rttUpdate(1024);
          rttUpdate["id"] = String(MY_NODE_ID) + "_RTT_" + String(millis());
          rttUpdate["type"] = "SYSTEM";
          rttUpdate["source"] = String(MY_NODE_ID);
          rttUpdate["destination"] = "E";
          rttUpdate["nextHop"] = "?";
          rttUpdate["priority"] = "SYSTEM";
          rttUpdate["timestamp"] = millis();

          JsonObject payload = rttUpdate.createNestedObject("payload");
          payload["target"] = sourceStr;
          payload["rtt"] = rtt;

          forwardPacket(rttUpdate);
        #endif
      }
      else if (type == "ROUTINE" || type == "EMERGENCY") {
        #if !IS_GATEWAY
          String text = doc["payload"]["text"];
          Serial.printf("[%s Alert] Received from %c: %s\n", type.c_str(), sourceChar, text.c_str());
        #endif
      }
    } 
    // Packet is not meant for us; forward it down the path
    else if (destStr != "ALL") {
      forwardPacket(doc);
    }
  }
}

// =========================================================================
// SERIAL PORT COMMAND INJECTION (GATEWAY ONLY)
// =========================================================================

void handleSerialInput() {
  static String inputBuffer = "";
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n') {
      inputBuffer.trim();
      if (inputBuffer.length() > 0) {
        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, inputBuffer);
        if (!error) {
          String destStr = doc["destination"];
          String nextHopStr = doc["nextHop"];
          String priority = doc["priority"];
          if (priority == "") priority = "SYSTEM";
          
          String msg;
          serializeJson(doc, msg);

          if (destStr == "ALL" || nextHopStr == "ALL") {
            queuePacket(msg, 0, priority);
          } else if (nextHopStr.length() == 1) {
            char nextChar = nextHopStr.charAt(0);
            uint32_t nextId = nodeIdMap[nextChar - 'A'];
            queuePacket(msg, nextId, priority);
          } else {
            queuePacket(msg, 0, priority);
          }
        }
      }
      inputBuffer = "";
    } else if (c != '\r') {
      inputBuffer += c;
    }
  }
}

// =========================================================================
// ARDUINO LIFECYCLE
// =========================================================================

void setup() {
  Serial.begin(115200);
  delay(1000);
  randomSeed(analogRead(0));

  Serial.printf("\n--- BOOTING Node %c (%s) ---\n", MY_NODE_ID, MY_NODE_ROLE);

  // Initialize painlessMesh
  mesh.setDebugMsgTypes(ERROR | STARTUP);
  mesh.init(MESH_PREFIX, MESH_PASSWORD, &userScheduler, MESH_PORT);
  mesh.onReceive(&receivedCallback);
  mesh.onNewConnection(&newConnectionCallback);
  mesh.onChangedConnections(&changedConnectionCallback);
  mesh.onNodeTimeAdjusted(&nodeTimeAdjustedCallback);

  // Enable baseline networking tasks
  userScheduler.addTask(heartbeatTask);
  heartbeatTask.enable();

  userScheduler.addTask(pingTask);
  pingTask.enable();

  userScheduler.addTask(queueDispatcherTask);
  queueDispatcherTask.enable();

  if (!IS_GATEWAY) {
    userScheduler.addTask(routineTask);
    routineTask.enable();
    Serial.println("System initialized. Command triggers: 'E' (SOS), 'N' (Normal Mode)");
  } else {
    Serial.println("System initialized in Hospital Gateway Mode. Directing Serial packet pipeline.");
  }
}

void loop() {
  mesh.update();

  // If node is a gateway, process external controller inputs
  #if IS_GATEWAY
    handleSerialInput();
  #else
    // Client node diagnostic keyboard triggers
    if (Serial.available() > 0) {
      char c = Serial.read();
      if (c == 'E' || c == 'e') {
        triggerEmergency();
      } else if (c == 'N' || c == 'n') {
        triggerNormalMode();
      }
    }
  #endif
}
