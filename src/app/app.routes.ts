import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { launchGuard } from './core/guards/launch.guard';
import { onboardingGuard, orgGuard } from './core/guards/org.guard';
import { termsAcceptedGuard, termsGuard } from './core/guards/terms.guard';
import { AppShell } from './layout/app-shell/app-shell';
import { ProjectShell } from './layout/project-shell/project-shell';

export const routes: Routes = [
  // Default landing: the launch dispatcher routes by organization count.
  { path: '', redirectTo: 'launch', pathMatch: 'full' },

  {
    path: 'auth',
    loadChildren: () => import('./features/iam/iam.routes').then((m) => m.IAM_ROUTES),
  },

  {
    path: 'terms',
    title: 'titles.terms',
    canActivate: [authGuard, termsAcceptedGuard],
    loadComponent: () => import('./features/iam/pages/terms/terms').then((m) => m.Terms),
  },

  // Create organization: standalone full-screen page, outside the app shell (no sidebar/header).
  {
    path: 'onboarding',
    title: 'titles.onboarding',
    canActivate: [authGuard, termsGuard, onboardingGuard],
    loadComponent: () =>
      import('./features/workspace/pages/create-organization/create-organization').then(
        (m) => m.CreateOrganization,
      ),
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
    title: 'titles.organizations',
    canActivate: [authGuard, termsGuard],
    loadComponent: () =>
      import('./features/workspace/pages/organizations/organizations').then((m) => m.Organizations),
  },

  // Project workspace: its own shell + nav (sessions / stories / members / settings).
  {
    path: 'projects/:projectId',
    component: ProjectShell,
    canActivate: [authGuard, termsGuard, orgGuard],
    children: [
      { path: '', redirectTo: 'sessions', pathMatch: 'full' },
      {
        path: 'sessions',
        title: 'titles.sessions',
        loadComponent: () =>
          import('./features/discovery/pages/sessions/sessions').then((m) => m.Sessions),
      },
      {
        path: 'sessions/:sessionId',
        title: 'titles.session',
        loadComponent: () =>
          import('./features/discovery/pages/session-detail/session-detail').then(
            (m) => m.SessionDetail,
          ),
      },
      {
        path: 'stories',
        title: 'titles.stories',
        loadComponent: () =>
          import('./features/discovery/pages/stories/stories').then((m) => m.ProjectStories),
      },
      {
        path: 'members',
        title: 'titles.projectMembers',
        loadComponent: () =>
          import('./features/workspace/pages/project-members/project-members').then(
            (m) => m.ProjectMembers,
          ),
      },
      {
        path: 'settings',
        title: 'titles.projectSettings',
        loadComponent: () =>
          import('./features/workspace/pages/project-settings/project-settings').then(
            (m) => m.ProjectSettings,
          ),
      },
    ],
  },

  {
    path: '',
    component: AppShell,
    canActivate: [authGuard, termsGuard],
    children: [
      {
        path: 'home',
        title: 'titles.home',
        loadComponent: () => import('./features/home/home').then((m) => m.Home),
      },
      {
        path: 'projects',
        title: 'titles.projects',
        canActivate: [orgGuard],
        loadComponent: () =>
          import('./features/workspace/pages/projects/projects').then((m) => m.Projects),
      },
      {
        path: 'members',
        title: 'titles.members',
        canActivate: [orgGuard],
        loadComponent: () =>
          import('./features/workspace/pages/members/members').then((m) => m.Members),
      },
      {
        path: 'settings',
        title: 'titles.settings',
        canActivate: [orgGuard],
        loadComponent: () =>
          import('./features/workspace/pages/settings/settings').then((m) => m.OrgSettings),
      },
    ],
  },

  { path: '**', redirectTo: 'projects' },
];
