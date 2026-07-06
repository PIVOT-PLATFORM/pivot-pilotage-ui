/**
 * Bootstrap de l'environnement de test Angular pour vitest standalone
 * (utilisé par Stryker via vitest.stryker.config.ts).
 *
 * App zoneless (pas de zone.js en dépendances) : on fournit
 * provideZonelessChangeDetection au platform de test.
 */
import { provideZonelessChangeDetection } from '@angular/core';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';

getTestBed().initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting([provideZonelessChangeDetection()]),
);
