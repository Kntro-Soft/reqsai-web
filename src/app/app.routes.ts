import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { onboardingGuard, orgGuard } from './core/guards/org.guard';
import { AppShell } from './layout/app-shell/app-shell';

export const routes: Routes = [
  // Default landing: the active organization's workspace (orgGuard bounces
  // users without an org to onboarding).
  { path: '', redirectTo: 'projects', pathMatch: 'full' },

  {
    path: 'auth',
    loadChildren: () => import('./features/iam/iam.routes').then((m) => m.IAM_ROUTES),
  },

  {
    path: '',
    component: AppShell,
    canActivate: [authGuard],
    children: [
      {
        path: 'home',
        title: 'Inicio · Reqs-AI',
        loadComponent: () => import('./features/home/home').then((m) => m.Home),
      },
      {
        path: 'onboarding',
        title: 'Crear organización · Reqs-AI',
        canActivate: [onboardingGuard],
        loadComponent: () =>
          import('./features/workspace/pages/create-organization/create-organization').then(
            (m) => m.CreateOrganization,
          ),
      },
      {
        path: 'projects',
        title: 'Proyectos · Reqs-AI',
        canActivate: [orgGuard],
        loadComponent: () =>
          import('./features/workspace/pages/projects/projects').then((m) => m.Projects),
      },
      {
        path: 'projects/:projectId/sessions',
        title: 'Sesiones · Reqs-AI',
        canActivate: [orgGuard],
        loadComponent: () =>
          import('./features/discovery/pages/sessions/sessions').then((m) => m.Sessions),
      },
      {
        path: 'projects/:projectId/sessions/:sessionId',
        title: 'Sesión · Reqs-AI',
        canActivate: [orgGuard],
        loadComponent: () =>
          import('./features/discovery/pages/session-detail/session-detail').then(
            (m) => m.SessionDetail,
          ),
      },
    ],
  },

  { path: '**', redirectTo: 'projects' },
];
