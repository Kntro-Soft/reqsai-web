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
    ],
  },

  { path: '**', redirectTo: 'home' },
];
