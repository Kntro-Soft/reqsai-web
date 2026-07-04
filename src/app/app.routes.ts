import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { launchGuard } from './core/guards/launch.guard';
import { onboardingGuard, orgGuard } from './core/guards/org.guard';
import { termsAcceptedGuard, termsGuard } from './core/guards/terms.guard';

export const routes: Routes = [
  // Default landing: the launch dispatcher routes by organization count.
  { path: '', redirectTo: 'launch', pathMatch: 'full' },

  {
    path: 'auth',
    loadChildren: () => import('./features/iam/iam.routes').then((m) => m.IAM_ROUTES),
  },

  // Invitation landing: chrome-less, no auth guard so logged-out invitees can view it.
  {
    path: 'invitations/accept',
    title: 'titles.acceptInvitation',
    loadComponent: () =>
      import('./features/workspace/pages/accept-invitation/accept-invitation').then(
        (m) => m.AcceptInvitation,
      ),
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

  // Create an ADDITIONAL organization: same component as onboarding, but without onboardingGuard
  // (which bounces users who already have an org), so existing users can reach it.
  {
    path: 'organizations/new',
    title: 'titles.onboarding',
    canActivate: [authGuard, termsGuard],
    loadComponent: () =>
      import('./features/workspace/pages/create-organization/create-organization').then(
        (m) => m.CreateOrganization,
      ),
  },

  {
    path: 'organizations',
    title: 'titles.organizations',
    canActivate: [authGuard, termsGuard],
    loadComponent: () =>
      import('./features/workspace/pages/organizations/organizations').then((m) => m.Organizations),
  },

  // Create project: standalone full-screen page (no app shell).
  {
    path: 'projects/new',
    title: 'titles.newProject',
    canActivate: [authGuard, termsGuard, orgGuard],
    loadComponent: () =>
      import('./features/workspace/pages/project-create/project-create').then(
        (m) => m.ProjectCreate,
      ),
  },

  // Unified workspace shell: one contextual sidebar for both the organization
  // context (projects / members / settings) and a single project's context.
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    canActivate: [authGuard, termsGuard],
    children: [
      {
        path: 'projects',
        title: 'titles.projects',
        canActivate: [orgGuard],
        loadComponent: () =>
          import('./features/workspace/pages/projects/projects').then((m) => m.Projects),
      },
      // Members moved under Settings; keep the old path working.
      { path: 'members', redirectTo: 'settings/members', pathMatch: 'full' },
      {
        path: 'settings',
        canActivate: [orgGuard],
        children: [
          { path: '', redirectTo: 'general', pathMatch: 'full' },
          {
            path: 'general',
            title: 'titles.general',
            loadComponent: () =>
              import('./features/workspace/pages/settings/settings').then((m) => m.OrgSettings),
          },
          {
            path: 'members',
            title: 'titles.members',
            loadComponent: () =>
              import('./features/workspace/pages/members/members').then((m) => m.Members),
          },
          {
            path: 'billing',
            title: 'titles.billing',
            loadComponent: () =>
              import('./shared/components/coming-soon/coming-soon').then((m) => m.ComingSoon),
            data: { titleKey: 'titles.billing', icon: 'lucideCreditCard' },
          },
          {
            path: 'integrations',
            title: 'titles.integrations',
            loadComponent: () =>
              import('./shared/components/coming-soon/coming-soon').then((m) => m.ComingSoon),
            data: { titleKey: 'titles.integrations', icon: 'lucidePlug' },
          },
          {
            path: 'usage',
            title: 'titles.usage',
            loadComponent: () =>
              import('./shared/components/coming-soon/coming-soon').then((m) => m.ComingSoon),
            data: { titleKey: 'titles.usage', icon: 'lucideChartLine' },
          },
        ],
      },
      {
        path: 'account',
        children: [
          { path: '', redirectTo: 'profile', pathMatch: 'full' },
          {
            path: 'profile',
            title: 'titles.profile',
            loadComponent: () =>
              import('./features/iam/pages/account/profile/profile').then((m) => m.AccountProfile),
          },
          {
            path: 'security',
            title: 'titles.security',
            loadComponent: () =>
              import('./features/iam/pages/account/security/security').then(
                (m) => m.AccountSecurity,
              ),
          },
          {
            path: 'appearance',
            title: 'titles.appearance',
            loadComponent: () =>
              import('./features/iam/pages/account/appearance/appearance').then(
                (m) => m.AccountAppearance,
              ),
          },
          {
            path: 'notifications',
            title: 'titles.notifications',
            loadComponent: () =>
              import('./shared/components/coming-soon/coming-soon').then((m) => m.ComingSoon),
            data: { titleKey: 'titles.notifications', icon: 'lucideBell' },
          },
          {
            path: 'tokens',
            title: 'titles.tokens',
            loadComponent: () =>
              import('./shared/components/coming-soon/coming-soon').then((m) => m.ComingSoon),
            data: { titleKey: 'titles.tokens', icon: 'lucideKey' },
          },
        ],
      },
      {
        path: 'projects/:projectId',
        canActivate: [orgGuard],
        children: [
          { path: '', redirectTo: 'overview', pathMatch: 'full' },
          {
            path: 'overview',
            title: 'titles.overview',
            loadComponent: () =>
              import('./features/workspace/pages/project-overview/project-overview').then(
                (m) => m.ProjectOverview,
              ),
          },
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
          // Members moved under Settings; keep the old path working.
          { path: 'members', redirectTo: 'settings/members', pathMatch: 'full' },
          {
            path: 'settings',
            children: [
              { path: '', redirectTo: 'general', pathMatch: 'full' },
              {
                path: 'general',
                title: 'titles.general',
                loadComponent: () =>
                  import('./features/workspace/pages/project-settings/project-settings').then(
                    (m) => m.ProjectSettings,
                  ),
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
                path: 'danger',
                title: 'titles.danger',
                loadComponent: () =>
                  import('./shared/components/coming-soon/coming-soon').then((m) => m.ComingSoon),
                data: { titleKey: 'titles.danger', icon: 'lucideTriangleAlert' },
              },
            ],
          },
        ],
      },
    ],
  },

  { path: '**', redirectTo: 'projects' },
];
