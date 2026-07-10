import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { launchGuard } from './core/guards/launch.guard';
import { onboardingGuard, orgGuard } from './core/guards/org.guard';
import {
  requireOrgRole,
  projectSettingsLanding,
  requirePermission,
  requirePermissionMatch,
} from './core/guards/permission.guard';
import { termsAcceptedGuard, termsGuard } from './core/guards/terms.guard';
import { recordingLeaveGuard } from './features/discovery/guards/recording-leave.guard';

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

  // Atlassian OAuth 2.0 redirect landing: chrome-less (no shell), auth-guarded so the
  // silent-refresh initializer has restored the session by the time it exchanges the
  // authorization code. Sits outside the shell because Atlassian fully reloads the SPA.
  {
    path: 'settings/integrations/jira/callback',
    title: 'titles.integrations',
    canActivate: [authGuard, termsGuard],
    loadComponent: () =>
      import('./features/workspace/pages/jira-oauth-callback/jira-oauth-callback').then(
        (m) => m.JiraOAuthCallback,
      ),
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
            // Owner-only server-side; also hosts the owner/admin base-permission card.
            canActivate: [requireOrgRole('OWNER')],
            data: { orgRole: 'OWNER' },
            loadComponent: () =>
              import('./features/workspace/pages/settings/settings').then((m) => m.OrgSettings),
          },
          {
            path: 'members',
            title: 'titles.members',
            canActivate: [requireOrgRole('ADMIN')],
            data: { orgRole: 'ADMIN' },
            loadComponent: () =>
              import('./features/workspace/pages/members/members').then((m) => m.Members),
          },
          {
            path: 'billing',
            title: 'titles.billing',
            loadComponent: () =>
              import('./features/billing/pages/billing/billing').then((m) => m.Billing),
          },
          {
            path: 'integrations',
            title: 'titles.integrations',
            loadComponent: () =>
              import('./features/workspace/pages/org-integrations/org-integrations').then(
                (m) => m.OrgIntegrations,
              ),
          },
          {
            path: 'usage',
            title: 'titles.usage',
            loadComponent: () =>
              import('./features/billing/pages/usage/usage').then((m) => m.Usage),
          },
        ],
      },
      // Payment-provider hosted-checkout return landings (Stripe success/cancel URLs).
      {
        path: 'billing/success',
        title: 'titles.billing',
        loadComponent: () =>
          import('./features/billing/pages/checkout-result/checkout-result').then(
            (m) => m.CheckoutResult,
          ),
        data: { outcome: 'success' },
      },
      {
        path: 'billing/cancel',
        title: 'titles.billing',
        loadComponent: () =>
          import('./features/billing/pages/checkout-result/checkout-result').then(
            (m) => m.CheckoutResult,
          ),
        data: { outcome: 'cancel' },
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
            // Discovery chat is the default project view under the (kept) "sessions" segment.
            path: 'sessions',
            title: 'titles.discovery',
            canActivate: [requirePermission('SESSION_READ')],
            canDeactivate: [recordingLeaveGuard],
            loadComponent: () =>
              import('./features/discovery/pages/discovery-chat/discovery-chat').then(
                (m) => m.DiscoveryChat,
              ),
          },
          {
            path: 'sessions/history',
            title: 'titles.history',
            canActivate: [requirePermission('SESSION_READ')],
            loadComponent: () =>
              import('./features/discovery/pages/history/history').then((m) => m.DiscoveryHistory),
          },
          {
            path: 'stories',
            title: 'titles.stories',
            canActivate: [requirePermission('STORY_READ')],
            loadComponent: () =>
              import('./features/discovery/pages/stories/stories').then((m) => m.ProjectStories),
          },
          {
            path: 'stories/new',
            title: 'titles.newStory',
            canActivate: [requirePermission('STORY_WRITE')],
            loadComponent: () =>
              import('./features/discovery/pages/stories/story-form').then((m) => m.StoryCreate),
          },
          {
            path: 'stories/:storyId',
            title: 'titles.story',
            canActivate: [requirePermission('STORY_READ')],
            loadComponent: () =>
              import('./features/discovery/pages/stories/story-detail').then((m) => m.StoryDetail),
          },
          {
            path: 'glossary',
            title: 'titles.glossary',
            canActivate: [requirePermission('GLOSSARY_READ')],
            loadComponent: () =>
              import('./features/discovery/pages/glossary/glossary').then((m) => m.ProjectGlossary),
          },
          {
            path: 'constraints',
            title: 'titles.constraints',
            canActivate: [requirePermission('CONSTRAINT_READ')],
            loadComponent: () =>
              import('./features/discovery/pages/constraints/constraints').then(
                (m) => m.ProjectConstraints,
              ),
          },
          // Members moved under Settings; keep the old path working.
          { path: 'members', redirectTo: 'settings/members', pathMatch: 'full' },
          {
            path: 'settings',
            children: [
              {
                path: '',
                pathMatch: 'full',
                canActivate: [projectSettingsLanding],
                loadComponent: () =>
                  import('./features/workspace/pages/project-overview/project-overview').then(
                    (m) => m.ProjectOverview,
                  ),
              },
              {
                path: 'general',
                title: 'titles.general',
                canActivate: [requirePermission('PROJECT_UPDATE')],
                data: { permission: 'PROJECT_UPDATE' },
                loadComponent: () =>
                  import('./features/workspace/pages/project-settings/project-settings').then(
                    (m) => m.ProjectSettings,
                  ),
              },
              {
                path: 'roles',
                title: 'titles.projectRoles',
                canMatch: [requirePermissionMatch('ROLE_READ')],
                canActivate: [requirePermission('ROLE_READ')],
                data: { permission: 'ROLE_READ' },
                loadComponent: () =>
                  import('./features/workspace/pages/project-roles/project-roles').then(
                    (m) => m.ProjectRoles,
                  ),
              },
              {
                path: 'roles/new',
                title: 'titles.newRole',
                canActivate: [requirePermission('ROLE_CREATE')],
                data: { permission: 'ROLE_CREATE' },
                loadComponent: () =>
                  import('./features/workspace/pages/project-role-form/project-role-form').then(
                    (m) => m.ProjectRoleForm,
                  ),
              },
              {
                path: 'roles/:roleId/edit',
                title: 'titles.editRole',
                canActivate: [requirePermission('ROLE_UPDATE')],
                data: { permission: 'ROLE_UPDATE' },
                loadComponent: () =>
                  import('./features/workspace/pages/project-role-form/project-role-form').then(
                    (m) => m.ProjectRoleForm,
                  ),
              },
              {
                path: 'members',
                title: 'titles.projectMembers',
                canMatch: [requirePermissionMatch('MEMBER_READ')],
                canActivate: [requirePermission('MEMBER_READ')],
                data: { permission: 'MEMBER_READ' },
                loadComponent: () =>
                  import('./features/workspace/pages/project-members/project-members').then(
                    (m) => m.ProjectMembers,
                  ),
              },
              {
                path: 'integrations',
                title: 'titles.integrations',
                loadComponent: () =>
                  import('./features/workspace/pages/project-integrations/project-integrations').then(
                    (m) => m.ProjectIntegrations,
                  ),
              },
              {
                path: 'danger',
                title: 'titles.danger',
                canMatch: [requirePermissionMatch('PROJECT_DELETE')],
                canActivate: [requirePermission('PROJECT_DELETE')],
                data: { permission: 'PROJECT_DELETE' },
                loadComponent: () =>
                  import('./features/workspace/pages/project-danger/project-danger').then(
                    (m) => m.ProjectDanger,
                  ),
              },
            ],
          },
        ],
      },
    ],
  },

  { path: '**', redirectTo: 'projects' },
];
