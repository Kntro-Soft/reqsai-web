import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { AppShell } from './layout/app-shell/app-shell';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },

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
        loadComponent: () =>
          import('./features/workspace/pages/create-organization/create-organization').then(
            (m) => m.CreateOrganization,
          ),
      },
      {
        path: 'projects',
        title: 'Proyectos · Reqs-AI',
        loadComponent: () =>
          import('./features/workspace/pages/projects/projects').then((m) => m.Projects),
      },
      {
        path: 'projects/:projectId/sessions',
        title: 'Sesiones · Reqs-AI',
        loadComponent: () =>
          import('./features/discovery/pages/sessions/sessions').then((m) => m.Sessions),
      },
      {
        path: 'projects/:projectId/sessions/:sessionId',
        title: 'Sesión · Reqs-AI',
        loadComponent: () =>
          import('./features/discovery/pages/session-detail/session-detail').then(
            (m) => m.SessionDetail,
          ),
      },
    ],
  },

  { path: '**', redirectTo: 'home' },
];
