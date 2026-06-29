import { Routes } from '@angular/router';
import { AuthLayout } from '../../layout/auth-layout/auth-layout';

export const IAM_ROUTES: Routes = [
  {
    path: '',
    component: AuthLayout,
    children: [
      { path: '', redirectTo: 'sign-in', pathMatch: 'full' },
      {
        path: 'sign-in',
        title: 'Iniciar sesión · Reqs-AI',
        loadComponent: () => import('./pages/sign-in/sign-in').then((m) => m.SignIn),
      },
      {
        path: 'sign-up',
        title: 'Crear cuenta · Reqs-AI',
        loadComponent: () => import('./pages/sign-up/sign-up').then((m) => m.SignUp),
      },
      {
        path: 'verify-email',
        title: 'Verificar correo · Reqs-AI',
        loadComponent: () => import('./pages/verify-email/verify-email').then((m) => m.VerifyEmail),
      },
      {
        path: 'forgot-password',
        title: 'Recuperar contraseña · Reqs-AI',
        loadComponent: () =>
          import('./pages/forgot-password/forgot-password').then((m) => m.ForgotPassword),
      },
      {
        path: 'reset-password',
        title: 'Nueva contraseña · Reqs-AI',
        loadComponent: () =>
          import('./pages/reset-password/reset-password').then((m) => m.ResetPassword),
      },
    ],
  },
];
