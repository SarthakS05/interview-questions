<?php
// webhook.php — Fixed version
require_once "db.php"; // provides $pdo (PDO instance)

// Raise immediately if secret is not set — no silent dev-secret fallback
$WEBHOOK_SECRET = getenv("WEBHOOK_SECRET");
if (!$WEBHOOK_SECRET) {
    http_response_code(500);
    error_log("WEBHOOK_SECRET environment variable is required");
    echo "server misconfiguration";
    exit;
}

$AUDIT_ENABLED = getenv("AUDIT_ENABLED") === "true";

$ALLOWED_ROLES = ["user", "admin", "vendor"];

/**
 * Verify SHA256 signature using constant-time comparison
 * to prevent timing attacks.
 */
function verify_signature(string $sig, string $body, string $secret): bool {
    $expected = hash("sha256", $secret . $body);
    return hash_equals($expected, $sig); // constant-time compare — fixes timing attack
}

function is_valid_email(string $email): bool {
    return (bool) filter_var($email, FILTER_VALIDATE_EMAIL);
}

$method = $_SERVER["REQUEST_METHOD"] ?? "GET";
$path   = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);

// Basic routing
if ($method !== "POST" || $path !== "/webhook") {
    http_response_code(404);
    echo "not found";
    exit;
}

// Limit body to 64 KB
$raw = file_get_contents("php://input", false, null, 0, 65536);
if ($raw === false || strlen($raw) === 0) {
    http_response_code(400);
    echo "empty body";
    exit;
}

$sig = $_SERVER["HTTP_X_SIGNATURE"] ?? "";
if (!$sig || !verify_signature($sig, $raw, $WEBHOOK_SECRET)) {
    http_response_code(401);
    echo "bad sig";
    exit;
}

// Decode and validate JSON
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    http_response_code(400);
    echo "invalid json";
    exit;
}

$email    = $payload["email"]    ?? "";
$role     = $payload["role"]     ?? "user";
$metadata = $payload["metadata"] ?? [];

// Input validation
if (!is_valid_email($email)) {
    http_response_code(400);
    echo "invalid email";
    exit;
}

if (!in_array($role, $ALLOWED_ROLES, true)) {
    http_response_code(400);
    echo "invalid role";
    exit;
}

// Store raw payload for auditing — parameterized query prevents SQL injection
if ($AUDIT_ENABLED) {
    $stmt = $pdo->prepare(
        "INSERT INTO webhook_audit(email, raw_json) VALUES (:email, :raw)"
    );
    $stmt->execute([":email" => $email, ":raw" => $raw]);
}

// True upsert — parameterized query prevents SQL injection
$stmt = $pdo->prepare(
    "INSERT INTO users(email, role) VALUES(:email, :role)
     ON CONFLICT(email) DO UPDATE SET role = excluded.role"
);
$stmt->execute([":email" => $email, ":role" => $role]);

http_response_code(200);
echo "ok";
