import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProjectWeather, ProjectWeatherStatus } from '../data-access/weather.models';

/**
 * Stable icon token per status — copied verbatim from `ProjectWeatherStatus#icon()` server-side
 * (never invented client-side, same token space). Exposed on the rendered `<svg>` as
 * `data-weather-icon` so the mapping stays independently testable/verifiable against the backend
 * contract without depending on this component's internal glyph choices.
 */
const WEATHER_ICON_TOKEN: Record<ProjectWeatherStatus, string> = {
  SUNNY: 'weather-sunny',
  CLOUDY: 'weather-cloudy',
  STORMY: 'weather-stormy',
  INDETERMINATE: 'weather-unknown',
};

/**
 * Formats a variance (percentage points) to one decimal place with an explicit `+` sign only
 * when strictly positive (negative values already carry their own `-` sign; zero renders with no
 * sign) — or `null` when there is no variance to show (`status` is `INDETERMINATE`). Exported as
 * a pure function, independent of Transloco/TestBed, so the rounding/sign logic is directly
 * unit-testable without going through DOM rendering or i18n interpolation.
 */
export function formatVarianceLabel(varianceInPoints: number | null): string | null {
  if (varianceInPoints === null) {
    return null;
  }
  const rounded = Math.round(varianceInPoints * 10) / 10;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

/**
 * Presentational, reusable rendering of a project's normalized weather indicator (US23.2.4 —
 * "Météo et indicateurs normalisés"). Pure `@Input`-driven — no HTTP call, no `WeatherApiService`
 * (see `weather.models.ts`'s class-level TSDoc for why: the backend exposes no REST controller
 * for this domain yet, and neither consuming view this US targets — US23.2.1's consolidated
 * portfolio view, US23.2.2's dashboards — has shipped in this repo yet either). Whichever future
 * view ends up consuming a computed `ProjectWeather` simply feeds it as `[weather]`; this
 * component owns the mapping from status to icon/label/color exactly once, so it is never
 * duplicated or left to drift across those two future consumers — same "single source of
 * rendering truth" principle the backend record's own JavaDoc states for the *calculation* itself
 * ("le calcul doit être exposé via une API/entité réutilisable plutôt que dupliqué dans chaque
 * vue").
 *
 * **A11y (RGAA 4 / WCAG 2.1 AA) — never color alone.** Every status renders a **distinct SVG
 * glyph** (a different shape, not just a colored dot) *and* a visible, i18n'd text label side by
 * side — same pattern as `MilestoneMarkerComponent`'s diamond marker. The background color
 * (`weather-indicator--sunny` etc. modifier classes) is a decorative reinforcement layered on top,
 * never the only differentiator — verified both by shape (icon) and by text (label), exactly
 * mirroring the backend's own `WeatherDtoTest#everyStatus_carriesNonBlankLabelAndIcon_neverColorAlone`
 * guarantee. `INDETERMINATE` additionally surfaces its `indeterminateReason` (US23.2.4 error AC —
 * "un état indéterminé explicite plutôt qu'une météo par défaut trompeuse") both as the element's
 * `title` and as a visible, i18n'd detail span, so assistive tech and sighted users both learn
 * *why*, not just *that* the indicator is indeterminate.
 *
 * All labels (`portfolio.weather.status.*`, `portfolio.weather.indeterminateReason.*`,
 * `portfolio.weather.varianceLabel`) are externalized via Transloco — never the backend's own
 * fixed French `ProjectWeatherStatus#label()` (which is a JVM-side reference/fallback only, per
 * that enum's own JavaDoc: "the consumer maps this token to an actual glyph/icon asset").
 */
@Component({
  selector: 'app-weather-indicator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './weather-indicator.component.html',
  styleUrl: './weather-indicator.component.scss',
})
export class WeatherIndicatorComponent {
  readonly weather = input.required<ProjectWeather>();

  protected readonly iconToken = computed(() => WEATHER_ICON_TOKEN[this.weather().status]);

  protected readonly isIndeterminate = computed(() => this.weather().status === 'INDETERMINATE');

  /** i18n key for the current `indeterminateReason`, or `null` when the status isn't `INDETERMINATE`. */
  protected readonly indeterminateReasonKey = computed(() => {
    const reason = this.weather().indeterminateReason;
    return reason ? `portfolio.weather.indeterminateReason.${reason}` : null;
  });

  /**
   * Variance formatted for display, or `null` when `status` is `INDETERMINATE` (never a numeric
   * value in that case, mirroring the backend's own "never a misleading default" guarantee). See
   * `formatVarianceLabel`'s own TSDoc for the rounding/sign rules.
   */
  protected readonly varianceLabel = computed(() => formatVarianceLabel(this.weather().varianceInPoints));
}
