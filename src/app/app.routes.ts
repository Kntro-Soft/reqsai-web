import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { launchGuard } from './core/guards/launch.guard';
import { onboardingGuard, orgGuard } from './core/guards/org.guard';
import { termsAcceptedGuard, termsGuard } from './core/guards/terms.guard';
import { AppShell } from './layout/app-shell/app-shell';

export const routes: Routes = [
  // Default landing: the launch dispatcher routes by organization count.
  { path: '', redirectTo: 'launch', pathMatch: 'full' },

  {
    path: 'auth',
    loadChildren: () => import('./features/iam/iam.routes').then((m) => m.IAM_ROUTES),
  },

  {
    path: 'terms',
    title: 'Términos y Condiciones · Reqs-AI',
    canActivate: [authGuard, termsAcceptedGuard],
    loadComponent: () => import('./features/iam/pages/terms/terms').then((m) => m.Terms),
  },

  // Post-login dispatcher: none → onboarding, one → workspace, several → picker.
  {
    path: 'launch',
    canActivate: [authGuard, termsGuard, launchGuard],
    loadComponent: () =>
      import('./features/workspace/pages/launcher/launcher').then((m) => m.Launcher),
  },

  {
    path: 'organizations',
    title: 'Tus organizaciones · Reqs-AI',
    canActivate: [authGuard, termsGuard],
    loadComponent: () =>
      import('./features/workspace/pages/organizations/organizations').then((m) => m.Organizations),
  },

  {
    path: '',
    component: AppShell,
    canActivate: [authGuard, termsGuard],
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
        path: 'members',
        title: 'Miembros · Reqs-AI',
        canActivate: [orgGuard],
        loadComponent: () =>
          import('./features/workspace/pages/members/members').then((m) => m.Members),
      },
      {
        path: 'settings',
        title: 'Ajustes · Reqs-AI',
        canActivate: [orgGuard],
        loadComponent: () =>
          import('./features/workspace/pages/settings/settings').then((m) => m.OrgSettings),
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
