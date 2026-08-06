export interface SessionManifestEntry {
  id: string;
  session: string;
  convertedFrom: "telethon" | "gramjs";
  sourceFile: string;
  dcId?: number;
  server?: string;
  enabled: boolean;
  userId?: string;
  username?: string;
  firstName?: string;
}

export interface GroupManifestEntry {
  groupId: string;
  name?: string;
  enabled: boolean;
  inviteLink?: string;
  username?: string;
}

export interface SessionsManifest {
  generatedAt: string;
  sessionsDir: string;
  groups: GroupManifestEntry[];
  sessions: SessionManifestEntry[];
}
