export {};

type BatonRequestActor = {
  type: "none" | "board" | "agent";
  source: "none" | "local_implicit" | "session" | "agent_jwt" | "agent_key";
  userId?: string | undefined;
  companyIds?: string[] | undefined;
  isInstanceAdmin?: boolean | undefined;
  agentId?: string | undefined;
  companyId?: string | undefined;
  keyId?: string | undefined;
  runId?: string | undefined;
};

declare global {
  namespace Express {
    interface Request {
      actor: BatonRequestActor;
    }
  }
}
