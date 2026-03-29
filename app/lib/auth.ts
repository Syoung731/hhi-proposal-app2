// Auth stub — Clerk removed for development. Restore before production.

const DEV_USER = { user: null as unknown, email: "dev@hhi-builders.com", userId: "dev-user" };

export async function checkIsAdmin(): Promise<boolean> {
  return true;
}

export async function requireAdmin() {
  return DEV_USER;
}

export async function getCurrentUserEmail(): Promise<string | null> {
  return DEV_USER.email;
}
