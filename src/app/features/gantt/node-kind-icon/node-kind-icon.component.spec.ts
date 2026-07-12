import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { NodeKindIconComponent } from './node-kind-icon.component';
import { WbsNodeKind } from '../data-access/wbs.models';

function render(nodeKind: WbsNodeKind, label: string): ComponentFixture<NodeKindIconComponent> {
  const fixture = TestBed.createComponent(NodeKindIconComponent);
  fixture.componentRef.setInput('nodeKind', nodeKind);
  fixture.componentRef.setInput('label', label);
  fixture.detectChanges();
  return fixture;
}

describe('NodeKindIconComponent', () => {
  it('renders a distinct diamond glyph for a MILESTONE, aria-hidden and carrying the label as a tooltip', () => {
    const fixture = render('MILESTONE', 'Milestone');
    const el = fixture.nativeElement as HTMLElement;

    const wrapper = el.querySelector('.node-kind-icon') as HTMLElement;
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
    expect(wrapper.getAttribute('title')).toBe('Milestone');
    expect(el.querySelector('svg.node-kind-icon__glyph--milestone')).not.toBeNull();
    expect(el.querySelector('svg.node-kind-icon__glyph--recurring')).toBeNull();
  });

  it('renders a distinct repeat glyph for a RECURRING series, carrying the label as a tooltip', () => {
    const fixture = render('RECURRING', 'Recurring task series');
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.node-kind-icon')?.getAttribute('title')).toBe('Recurring task series');
    expect(el.querySelector('svg.node-kind-icon__glyph--recurring')).not.toBeNull();
    expect(el.querySelector('svg.node-kind-icon__glyph--milestone')).toBeNull();
  });

  it('renders no glyph for a SUMMARY node', () => {
    const fixture = render('SUMMARY', 'Summary task');
    expect((fixture.nativeElement as HTMLElement).querySelector('svg')).toBeNull();
  });

  it('renders no glyph for a LEAF node', () => {
    const fixture = render('LEAF', 'Task');
    expect((fixture.nativeElement as HTMLElement).querySelector('svg')).toBeNull();
  });
});
