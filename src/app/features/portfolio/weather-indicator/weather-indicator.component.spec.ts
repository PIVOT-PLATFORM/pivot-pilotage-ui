import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, it, expect } from 'vitest';
import { WeatherIndicatorComponent, formatVarianceLabel } from './weather-indicator.component';
import { ProjectWeather, ProjectWeatherIndeterminateReason, ProjectWeatherStatus } from '../data-access/weather.models';

/** Mirrors `ProjectWeatherStatus#icon()` exactly — see component TSDoc ("same token space, never invented client-side"). */
const BACKEND_ICON_TOKEN: Record<ProjectWeatherStatus, string> = {
  SUNNY: 'weather-sunny',
  CLOUDY: 'weather-cloudy',
  STORMY: 'weather-stormy',
  INDETERMINATE: 'weather-unknown',
};

function resolvedWeather(status: 'SUNNY' | 'CLOUDY' | 'STORMY', varianceInPoints: number): ProjectWeather {
  return {
    projectId: 1,
    tenantId: 7,
    status,
    actualProgressPercent: 55,
    expectedProgressPercent: 55 - varianceInPoints,
    varianceInPoints,
    asOfDate: '2026-07-01',
    indeterminateReason: null,
  };
}

function indeterminateWeather(reason: ProjectWeatherIndeterminateReason): ProjectWeather {
  return {
    projectId: 1,
    tenantId: 7,
    status: 'INDETERMINATE',
    actualProgressPercent: null,
    expectedProgressPercent: null,
    varianceInPoints: null,
    asOfDate: reason === 'MISSING_STATUS_DATE' ? null : '2026-07-01',
    indeterminateReason: reason,
  };
}

interface Harness {
  fixture: ComponentFixture<WeatherIndicatorComponent>;
  el: HTMLElement;
}

function create(weather: ProjectWeather): Harness {
  // Each `it()` may create more than one fixture (e.g. to compare several statuses) — TestBed
  // forbids reconfiguring after it's been instantiated once, so reset defensively every call.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WeatherIndicatorComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
  });
  const fixture = TestBed.createComponent(WeatherIndicatorComponent);
  fixture.componentRef.setInput('weather', weather);
  fixture.detectChanges();
  const el = (fixture.nativeElement as HTMLElement).querySelector('.weather-indicator') as HTMLElement;
  return { fixture, el };
}

describe('WeatherIndicatorComponent', () => {
  describe('resolved statuses (SUNNY / CLOUDY / STORMY) — nominal AC', () => {
    it('renders SUNNY with its backend icon token, BEM modifier, i18n label and a signed positive variance', () => {
      const { el } = create(resolvedWeather('SUNNY', 7.44));

      const icon = el.querySelector('.weather-indicator__icon');
      const label = el.querySelector('.weather-indicator__label');
      const variance = el.querySelector('.weather-indicator__variance');

      expect(el.classList.contains('weather-indicator--sunny')).toBe(true);
      expect(icon?.tagName.toLowerCase()).toBe('svg');
      expect(icon?.getAttribute('data-weather-icon')).toBe(BACKEND_ICON_TOKEN.SUNNY);
      expect(label?.textContent).toContain('portfolio.weather.status.SUNNY');
      expect(variance?.textContent).toContain('portfolio.weather.varianceLabel');
    });

    it('renders CLOUDY with its backend icon token, BEM modifier and label', () => {
      const { el } = create(resolvedWeather('CLOUDY', -8));

      expect(el.classList.contains('weather-indicator--cloudy')).toBe(true);
      expect(el.querySelector('.weather-indicator__icon')?.getAttribute('data-weather-icon')).toBe(
        BACKEND_ICON_TOKEN.CLOUDY,
      );
      expect(el.querySelector('.weather-indicator__label')?.textContent).toContain('portfolio.weather.status.CLOUDY');
    });

    it('renders STORMY with its backend icon token, BEM modifier and label', () => {
      const { el } = create(resolvedWeather('STORMY', -20));

      expect(el.classList.contains('weather-indicator--stormy')).toBe(true);
      expect(el.querySelector('.weather-indicator__icon')?.getAttribute('data-weather-icon')).toBe(
        BACKEND_ICON_TOKEN.STORMY,
      );
      expect(el.querySelector('.weather-indicator__label')?.textContent).toContain('portfolio.weather.status.STORMY');
    });

    it('never renders a title attribute for a resolved status (title is reserved for explaining INDETERMINATE)', () => {
      const { el } = create(resolvedWeather('SUNNY', 2));

      expect(el.hasAttribute('title')).toBe(false);
    });

    it('renders the variance span (i18n key present) whenever the status is resolved', () => {
      const { el } = create(resolvedWeather('CLOUDY', -8));

      expect(el.querySelector('.weather-indicator__variance')?.textContent).toContain('portfolio.weather.varianceLabel');
    });
  });

  describe('formatVarianceLabel — rounding/sign logic (pure function, no Angular/i18n involved)', () => {
    it('rounds to one decimal place and prefixes a "+" only when strictly positive', () => {
      expect(formatVarianceLabel(7.449)).toBe('+7.4');
    });

    it('keeps the native "-" sign for a negative value, rounded to one decimal place', () => {
      expect(formatVarianceLabel(-8.06)).toBe('-8.1');
    });

    it('renders zero with no sign', () => {
      expect(formatVarianceLabel(0.04)).toBe('0');
    });

    it('returns null when there is no variance to show (INDETERMINATE) — never a misleading default', () => {
      expect(formatVarianceLabel(null)).toBeNull();
    });
  });

  describe('INDETERMINATE — error AC: never a misleading default weather', () => {
    const REASONS: ProjectWeatherIndeterminateReason[] = ['MISSING_STATUS_DATE', 'MISSING_WINDOW', 'MISSING_PROGRESS'];

    it.each(REASONS)('renders no variance and exposes the %s reason as both title and visible text', (reason) => {
      const { el } = create(indeterminateWeather(reason));

      expect(el.classList.contains('weather-indicator--indeterminate')).toBe(true);
      expect(el.querySelector('.weather-indicator__variance')).toBeNull();
      expect(el.getAttribute('title')).toContain(`portfolio.weather.indeterminateReason.${reason}`);
      expect(el.querySelector('.weather-indicator__reason')?.textContent).toContain(
        `portfolio.weather.indeterminateReason.${reason}`,
      );
    });

    it('uses the distinct backend "weather-unknown" icon token — never a resolved-status icon', () => {
      const { el } = create(indeterminateWeather('MISSING_WINDOW'));

      expect(el.querySelector('.weather-indicator__icon')?.getAttribute('data-weather-icon')).toBe(
        BACKEND_ICON_TOKEN.INDETERMINATE,
      );
      expect(el.querySelector('.weather-indicator__label')?.textContent).toContain('portfolio.weather.status.INDETERMINATE');
    });
  });

  it('gives every one of the 4 statuses a distinct icon token and a distinct visible label — mirrors backend WeatherDtoTest#statusLabelsAndIcons_areDistinctAcrossStatuses', () => {
    const fixtures: ProjectWeather[] = [
      resolvedWeather('SUNNY', 1),
      resolvedWeather('CLOUDY', -6),
      resolvedWeather('STORMY', -18),
      indeterminateWeather('MISSING_PROGRESS'),
    ];

    const tokens = fixtures.map((weather) => create(weather).el.querySelector('.weather-indicator__icon')?.getAttribute('data-weather-icon'));
    const labels = fixtures.map((weather) => create(weather).el.querySelector('.weather-indicator__label')?.textContent);

    expect(new Set(tokens).size).toBe(fixtures.length);
    expect(new Set(labels).size).toBe(fixtures.length);
  });

  it('never conveys status via color alone — an SVG icon and a non-empty visible text label are always both present', () => {
    const statuses: ProjectWeather[] = [
      resolvedWeather('SUNNY', 0),
      resolvedWeather('CLOUDY', -6),
      resolvedWeather('STORMY', -18),
      indeterminateWeather('MISSING_WINDOW'),
    ];

    for (const weather of statuses) {
      const { el } = create(weather);
      const icon = el.querySelector('.weather-indicator__icon');
      const label = el.querySelector('.weather-indicator__label');

      expect(icon).not.toBeNull();
      expect(icon?.tagName.toLowerCase()).toBe('svg');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
      expect(label?.textContent?.trim().length).toBeGreaterThan(0);
    }
  });
});
