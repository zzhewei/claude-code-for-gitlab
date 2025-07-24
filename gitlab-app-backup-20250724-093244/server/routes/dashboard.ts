import { Router, Request, Response } from 'express';

import { getDataStore } from '../utils/config.js';

const router = Router();

// Middleware to ensure authentication
function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.user) {
    return res.redirect('/auth/gitlab');
  }
  next();
}

// Dashboard home
router.get('/', requireAuth, (req: Request, res: Response) => {
  const dataStore = getDataStore();
  const projects = dataStore.getUserProjects(req.session.user!.id);
  
  res.render('dashboard', {
    user: req.session.user,
    projects: projects.filter(p => p.enabled),
    projectCount: projects.length,
  });
});

// Project settings page
router.get('/project/:projectId', requireAuth, (req: Request, res: Response) => {
  const projectId = req.params.projectId;
  const dataStore = getDataStore();
  const project = dataStore.getProject(`project_${projectId}`);
  
  if (!project || project.userId !== req.session.user!.id) {
    return res.status(404).render('error', { error: 'Project not found' });
  }
  
  res.render('project-settings', {
    user: req.session.user,
    project,
  });
});

export default router;