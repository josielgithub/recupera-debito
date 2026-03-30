import { SignJWT, jwtVerify } from "jose";

const secret = process.env.JWT_SECRET ?? "";
console.log("JWT_SECRET length:", secret.length);
console.log("JWT_SECRET first 4 chars:", secret.substring(0, 4));

const secretKey = new TextEncoder().encode(secret);

// Simulate createSessionToken
const token = await new SignJWT({
  openId: "test-open-id",
  appId: process.env.VITE_APP_ID ?? "test-app-id",
  name: "Test User",
})
  .setProtectedHeader({ alg: "HS256", typ: "JWT" })
  .setExpirationTime(Math.floor((Date.now() + 365 * 24 * 60 * 60 * 1000) / 1000))
  .sign(secretKey);

console.log("Token created successfully, length:", token.length);

// Simulate verifySession
try {
  const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
  console.log("Token verified successfully:", payload.openId);
} catch (e) {
  console.error("Token verification FAILED:", e.message);
}
