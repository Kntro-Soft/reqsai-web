import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HasPermission } from './has-permission';
import { PermissionsStore } from '../../core/authz/permissions.store';
import { OrgRole } from '../../core/authz/permissions.models';

/** A fake store whose signals the tests drive directly, so no HTTP is involved. */
class FakePermissionsStore {
  role = signal<OrgRole | null>(null);
  perms = signal<ReadonlySet<string>>(new Set());

  isOrgOwner = () => this.role() === 'OWNER';
  isOrgOwnerOrAdmin = () => this.role() === 'OWNER' || this.role() === 'ADMIN';
  has(permission: string): boolean {
    if (this.isOrgOwnerOrAdmin()) return true;
    return this.perms().has(permission);
  }
}

@Component({
  standalone: true,
  imports: [HasPermission],
  template: `
    <span *appHasPermission="'STORY_WRITE'" data-testid="perm">perm</span>
    <span *appHasPermission="null; role: 'ADMIN'" data-testid="admin">admin</span>
  `,
})
class Host {}

describe('HasPermission directive', () => {
  let fixture: ComponentFixture<Host>;
  let store: FakePermissionsStore;

  beforeEach(() => {
    store = new FakePermissionsStore();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: PermissionsStore, useValue: store }],
    });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  function has(testid: string): boolean {
    return !!fixture.nativeElement.querySelector(`[data-testid="${testid}"]`);
  }

  it('hides permission-gated content when the caller lacks it', () => {
    expect(has('perm')).toBe(false);
  });

  it('shows permission-gated content once the permission is present', () => {
    store.perms.set(new Set(['STORY_WRITE']));
    fixture.detectChanges();
    expect(has('perm')).toBe(true);
  });

  it('lets an owner see permission-gated content (implicit bypass)', () => {
    store.role.set('OWNER');
    fixture.detectChanges();
    expect(has('perm')).toBe(true);
  });

  it('hides role-gated content from a member', () => {
    store.role.set('MEMBER');
    fixture.detectChanges();
    expect(has('admin')).toBe(false);
  });

  it('shows role-gated content to an admin', () => {
    store.role.set('ADMIN');
    fixture.detectChanges();
    expect(has('admin')).toBe(true);
  });

  it('re-hides content reactively when the grant is revoked', () => {
    store.role.set('ADMIN');
    fixture.detectChanges();
    expect(has('admin')).toBe(true);

    store.role.set('MEMBER');
    fixture.detectChanges();
    expect(has('admin')).toBe(false);
  });
});
