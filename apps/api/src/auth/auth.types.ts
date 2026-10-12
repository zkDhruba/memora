import type { SessionUser } from "./session.service";

export const AUTH_REQUEST_KEY = "memoraAuth" as const;

export type AuthContext = {
  sessionId: string;
  user: SessionUser;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      [AUTH_REQUEST_KEY]?: AuthContext;
    }
  }
}
