#!/bin/bash
# Production Fix Verification Script
# Run this after Railway redeploys to confirm the fix works

API_URL="${1:-https://tito-production.up.railway.app}"
WORKER_EMAIL="testworker@verification.local"
WORKER_PASSWORD="verify123456"

echo "=== Tito Production Fix Verification ==="
echo "Testing against: $API_URL"
echo ""

# Step 1: Register a test worker
echo "[1/5] Registering test worker..."
REGISTER=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"firstName\":\"Verify\",
    \"lastName\":\"Worker\",
    \"email\":\"$WORKER_EMAIL\",
    \"staffId\":\"VERIFY001\",
    \"password\":\"$WORKER_PASSWORD\",
    \"confirmPassword\":\"$WORKER_PASSWORD\"
  }")

TOKEN=$(echo $REGISTER | jq -r '.token // empty')
if [ -z "$TOKEN" ]; then
  echo "❌ FAILED: Could not register worker"
  echo "Response: $REGISTER"
  exit 1
fi
echo "✓ Worker registered with token: ${TOKEN:0:10}..."

# Step 2: Check initial status
echo "[2/5] Checking initial status..."
STATUS=$(curl -s -X GET "$API_URL/api/time/status" \
  -H "Authorization: Bearer $TOKEN")

CURRENT_STATUS=$(echo $STATUS | jq -r '.status // empty')
if [ "$CURRENT_STATUS" != "not_clocked_in" ]; then
  echo "❌ FAILED: Expected status 'not_clocked_in', got '$CURRENT_STATUS'"
  exit 1
fi
echo "✓ Status check passed: $CURRENT_STATUS"

# Step 3: Perform clock in
echo "[3/5] Performing clock in..."
CLOCK_IN=$(curl -s -X POST "$API_URL/api/time/actions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actionType": "clock_in",
    "location": {
      "latitude": 40.7128,
      "longitude": -74.0060,
      "accuracy": 10,
      "capturedAt": "2026-04-13T12:00:00Z"
    }
  }')

CLOCK_IN_STATUS=$(echo $CLOCK_IN | jq -r '.status // empty')
if [ "$CLOCK_IN_STATUS" != "clocked_in" ]; then
  ERROR=$(echo $CLOCK_IN | jq -r '.error // empty')
  echo "❌ FAILED: Clock in expected status 'clocked_in', got '$CLOCK_IN_STATUS'"
  echo "Error: $ERROR"
  exit 1
fi
echo "✓ Clock in successful: $CLOCK_IN_STATUS"

# Step 4: Perform break start
echo "[4/5] Performing break start..."
BREAK_START=$(curl -s -X POST "$API_URL/api/time/actions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actionType": "break_start",
    "location": {
      "latitude": 40.7128,
      "longitude": -74.0060,
      "accuracy": 10,
      "capturedAt": "2026-04-13T12:05:00Z"
    }
  }')

BREAK_STATUS=$(echo $BREAK_START | jq -r '.status // empty')
if [ "$BREAK_STATUS" != "on_break" ]; then
  ERROR=$(echo $BREAK_START | jq -r '.error // empty')
  echo "❌ FAILED: Break start expected status 'on_break', got '$BREAK_STATUS'"
  echo "Error: $ERROR"
  exit 1
fi
echo "✓ Break start successful: $BREAK_STATUS"

# Step 5: Perform break end
echo "[5/5] Performing break end..."
BREAK_END=$(curl -s -X POST "$API_URL/api/time/actions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actionType": "break_end",
    "location": {
      "latitude": 40.7128,
      "longitude": -74.0060,
      "accuracy": 10,
      "capturedAt": "2026-04-13T12:10:00Z"
    }
  }')

BREAK_END_STATUS=$(echo $BREAK_END | jq -r '.status // empty')
if [ "$BREAK_END_STATUS" != "clocked_in" ]; then
  ERROR=$(echo $BREAK_END | jq -r '.error // empty')
  echo "❌ FAILED: Break end expected status 'clocked_in', got '$BREAK_END_STATUS'"
  echo "Error: $ERROR"
  exit 1
fi
echo "✓ Break end successful: $BREAK_END_STATUS"

echo ""
echo "=== ✅ ALL TESTS PASSED ==="
echo "The production fix is working correctly!"
echo "Attendance actions complete successfully with breaks query resilience."
