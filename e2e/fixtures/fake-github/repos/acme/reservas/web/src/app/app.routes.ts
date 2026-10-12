import { Routes } from '@angular/router';
export const routes: Routes = [
  { path: 'reservar', loadComponent: () => import('./reservas/booking').then(m => m.Booking) },
  { path: 'mis-reservas', loadComponent: () => import('./reservas/my-reservations').then(m => m.MyReservations) },
  { path: 'carta', loadComponent: () => import('./reservas/menu-page').then(m => m.MenuPage) },
];
