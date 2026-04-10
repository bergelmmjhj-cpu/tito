export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req?.user?.role;
    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({ error: "Forbidden: insufficient role" });
      return;
    }

    next();
  };
}
