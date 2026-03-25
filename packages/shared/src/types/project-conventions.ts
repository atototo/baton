export interface ProjectConventions {
  id: string;
  companyId: string;
  projectId: string;
  conventionsMd: string;
  backstory: string;
  compactContext: string | null;
  extraReferences: unknown[];
  createdAt: Date;
  updatedAt: Date;
}
