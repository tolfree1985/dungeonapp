import { describe, expect, it } from 'vitest';
import { buildStateSummary } from '../stateSummaryTranslator';

describe('stateSummaryTranslator', () => {
  it('reports oil and fire setup in world/opportunities/care', () => {
    const summary = buildStateSummary({
      flags: {
        'fabric.oiled': true,
        'scene.fire': true,
      },
      stats: { noise: 10, heat: 5, time: 5 },
    });

    expect(summary.world).toContain('Chamber fire remains active');
    expect(summary.world).toContain('Tapestry is oil-soaked');
    expect(summary.opportunities).toContain('The oil can be ignited');
    expect(summary.careNow).toContain('Oil makes the floor slick and volatile');
  });

  it('reports crate state progression and opportunities', () => {
    const summary = buildStateSummary({
      flags: {
        'crate.weakened': true,
        'container.crate_open': true,
      },
      stats: {},
    });
    expect(summary.world).toContain('The crate structure is compromised');
    expect(summary.world).toContain('The crate has been opened');
    expect(summary.opportunities).toContain('Crate is weakened and can be pried');
    expect(summary.opportunities).toContain('Opened crate may contain useful items');
  });

  it('reports high danger as care and world outputs', () => {
    const summary = buildStateSummary({
      flags: {},
      stats: { heat: 30, noise: 40, alert: 3 },
    });
    expect(summary.careNow).toContain('Danger is critical');
    expect(summary.careNow).toContain('Alertness is elevated');
    expect(summary.world).toContain('The chamber is dangerously hot');
    expect(summary.opportunities).toContain('The heat could force a retreat');
    expect(summary.careNow).toContain('Noise is drawing attention');
  });
});
