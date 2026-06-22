#include "painlessMesh.h"
#include <ArduinoJson.h>

// ==========================================
// 1. NODE CONFIGURATION
// * CHANGE THIS LETTER FOR EACH BOARD! *
// ==========================================
#define MY_NODE_ID 'A'  // Change to 'B', 'C', or 'D'

#define RELIEF_NODE 'E' // Gateway connected to the PC
#define MESH_PREFIX     "DisasterMesh"
#define MESH_PASSWORD   "Rescue1234"
#define MESH_PORT       5555

Scheduler userScheduler;
painlessMesh  mesh;

bool isEmergencyMode = false; 

// ==========================================
// 2. TASK DECLARATIONS
// ==========================================
void sendPing();
void triggerRoutineMessage();

// Ping every 5 seconds (serves as our heartbeat for the dashboard)
Task pingTask(5000, TASK_FOREVER, &sendPing);

// Send normal data every 10 seconds
Task routineTask(10000, TASK_FOREVER, &triggerRoutineMessage);

// ==========================================
// 3. ROUTING & MESSAGING LOGIC
// ==========================================
void sendPing() {
  DynamicJsonDocument doc(1024);
  doc["type"] = "PING";
  doc["source"] = String(MY_NODE_ID);
  doc["timestamp"] = millis(); 
  
  String msg;
  serializeJson(doc, msg);
  mesh.sendBroadcast(msg);
}

void triggerRoutineMessage() {
  if (isEmergencyMode) return; 

  // ROUND ROBIN LOGIC
  char nodes[] = {'A', 'B', 'C', 'D'};
  static int rrIndex = 0; // 'static' keeps its value between function calls
  char targetNode;
  
  // Pick the next node in the array, skipping ourselves
  do {
    targetNode = nodes[rrIndex];
    rrIndex = (rrIndex + 1) % 4; // Cycle 0, 1, 2, 3, 0...
  } while (targetNode == MY_NODE_ID);

  DynamicJsonDocument doc(1024);
  doc["type"] = "ROUTINE";
  doc["source"] = String(MY_NODE_ID);
  doc["target"] = String(targetNode);
  doc["payload"] = "Routine sensor data update.";
  
  String msg;
  serializeJson(doc, msg);
  mesh.sendBroadcast(msg);
  
  Serial.printf("[NORMAL] Sent Routine message to Node %c\n", targetNode);
}

void triggerEmergency() {
  isEmergencyMode = true; 

  DynamicJsonDocument doc(1024);
  doc["type"] = "EMERGENCY";
  doc["source"] = String(MY_NODE_ID);
  doc["target"] = String(RELIEF_NODE);
  doc["payload"] = "SOS! Help is being sent to Node " + String(MY_NODE_ID) + "!";
  
  String msg;
  serializeJson(doc, msg);
  mesh.sendBroadcast(msg);
  
  Serial.println("[URGENT] EMERGENCY TRIGGERED!");
}

void triggerNormalMode() {
  if (!isEmergencyMode) return; 
  isEmergencyMode = false; 

  DynamicJsonDocument doc(1024);
  doc["type"] = "NORMAL_RESTORE"; // New specific type for the dashboard to catch
  doc["source"] = String(MY_NODE_ID);
  doc["payload"] = "Node " + String(MY_NODE_ID) + " resolved the emergency.";
  
  String msg;
  serializeJson(doc, msg);
  mesh.sendBroadcast(msg);
  
  Serial.println("[NORMAL] Emergency resolved.");
}

// ==========================================
// 4. MESH RECEIVE CALLBACK
// ==========================================
void receivedCallback(uint32_t from, String &msg) {
  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, msg);
  if (error) return;

  String type = doc["type"];
  String source = doc["source"];

  if (type == "PING") {
    unsigned long originalTime = doc["timestamp"];
    DynamicJsonDocument reply(1024);
    reply["type"] = "PONG";
    reply["source"] = String(MY_NODE_ID);
    reply["target"] = source;
    reply["timestamp"] = originalTime; 
    
    String replyMsg;
    serializeJson(reply, replyMsg);
    mesh.sendBroadcast(replyMsg);
  } 
  else if (type == "PONG") {
    String target = doc["target"];
    if (target.charAt(0) == MY_NODE_ID) {
      unsigned long sentTime = doc["timestamp"];
      Serial.printf("[METRICS] RTT to Node %s: %lu ms\n", source.c_str(), millis() - sentTime);
    }
  }
}

// ==========================================
// 5. SETUP & MAIN LOOP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.printf("\n--- Starting Mesh Node %c ---\n", MY_NODE_ID);

  mesh.setDebugMsgTypes(ERROR | STARTUP);  
  mesh.init(MESH_PREFIX, MESH_PASSWORD, &userScheduler, MESH_PORT);
  mesh.onReceive(&receivedCallback);

  userScheduler.addTask(pingTask);
  pingTask.enable();
  
  userScheduler.addTask(routineTask);
  routineTask.enable();
}

void loop() {
  mesh.update();

  if (Serial.available() > 0) {
    char input = Serial.read();
    if (input == 'E' || input == 'e') triggerEmergency();
    else if (input == 'N' || input == 'n') triggerNormalMode();
  }
}
