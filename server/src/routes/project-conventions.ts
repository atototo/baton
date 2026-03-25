import { Router } from "express";
import type { Db } from "@atototo/db";
import { upsertProjectConventionsSchema, updateProjectConventionsSchema } from "@atototo/shared";
import { validate } from "../middleware/validate.js";
import { projectService, projectConventionsService } from "../services/index.js";
import { assertCompanyAccess } from "./authz.js";

export function projectConventionRoutes(db: Db) {
  const router = Router();
  const svc = projectConventionsService(db);
  const projectSvc = projectService(db);

  // GET /api/projects/:projectId/conventions
  router.get("/projects/:projectId/conventions", async (req, res) => {
    const projectId = req.params.projectId as string;
    const project = await projectSvc.getById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    const conventions = await svc.getByProjectId(projectId);
    if (!conventions) {
      res.json({
        id: null,
        companyId: project.companyId,
        projectId,
        conventionsMd: "",
        backstory: "",
        compactContext: null,
        extraReferences: [],
        createdAt: null,
        updatedAt: null,
      });
      return;
    }
    res.json(conventions);
  });

  // PUT /api/projects/:projectId/conventions
  router.put(
    "/projects/:projectId/conventions",
    validate(upsertProjectConventionsSchema),
    async (req, res) => {
      const projectId = req.params.projectId as string;
      const project = await projectSvc.getById(projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, project.companyId);
      const conventions = await svc.upsert(project.companyId, projectId, req.body);
      res.json(conventions);
    },
  );

  // PATCH /api/projects/:projectId/conventions
  router.patch(
    "/projects/:projectId/conventions",
    validate(updateProjectConventionsSchema),
    async (req, res) => {
      const projectId = req.params.projectId as string;
      const project = await projectSvc.getById(projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, project.companyId);

      const existing = await svc.getByProjectId(projectId);
      if (!existing) {
        // Auto-create if not exists on PATCH
        const conventions = await svc.upsert(project.companyId, projectId, req.body);
        res.json(conventions);
        return;
      }
      const conventions = await svc.update(projectId, req.body);
      if (!conventions) {
        res.status(404).json({ error: "Project conventions not found" });
        return;
      }
      res.json(conventions);
    },
  );

  // POST /api/projects/:projectId/conventions/compact
  router.post("/projects/:projectId/conventions/compact", async (req, res) => {
    const projectId = req.params.projectId as string;
    const project = await projectSvc.getById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    const compact = await svc.generateCompactContext(projectId);
    res.json({ compactContext: compact });
  });

  return router;
}
