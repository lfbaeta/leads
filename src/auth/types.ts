export type UserRole = "ADMIN" | "ATTENDANT";

export type AuthContext = {
  sessionId: string;
  userId: string;
  organizationId: string;
  userName: string;
  email: string;
  role: UserRole;
  organizationName: string;
};
