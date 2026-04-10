export function parseBearerToken(req) {
  const value = req.headers.authorization || "";
  const [type, token] = value.split(" ");
  if (type !== "Bearer" || !token) return null;
  return token.trim();
}
