import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/explorer/explorer').then((m) => m.Explorer),
    title: 'PKS Explorer',
  },
  { path: '**', redirectTo: '' },
];
