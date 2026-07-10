import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PermissionsStore } from './permissions.store';

describe('PermissionsStore', () => {
  let store: PermissionsStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PermissionsStore, provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(PermissionsStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts empty', () => {
    expect(store.orgRole()).toBeNull();
    expect(store.memberBasePermission()).toBeNull();
    expect(store.projectPermissions().size).toBe(0);
    expect(store.has('STORY_READ')).toBe(false);
    expect(store.isOrgOwnerOrAdmin()).toBe(false);
  });

  it('loads org authorization and exposes role helpers', () => {
    store.loadOrgAuthorization('org-1').subscribe();
    http
      .expectOne('/api/organizations/org-1/me/authorization')
      .flush({ orgRole: 'ADMIN', memberBasePermission: 'READ' });

    expect(store.orgRole()).toBe('ADMIN');
    expect(store.memberBasePermission()).toBe('READ');
    expect(store.isOrgAdmin()).toBe(true);
    expect(store.isOrgOwner()).toBe(false);
    expect(store.isOrgOwnerOrAdmin()).toBe(true);
  });

  it('caches org authorization per id (no second request)', () => {
    store.loadOrgAuthorization('org-1').subscribe();
    http
      .expectOne('/api/organizations/org-1/me/authorization')
      .flush({ orgRole: 'MEMBER', memberBasePermission: 'NONE' });

    store.loadOrgAuthorization('org-1').subscribe();
    http.expectNone('/api/organizations/org-1/me/authorization');
  });

  it('loads project permissions into a set and answers has()', () => {
    store.loadOrgAuthorization('org-1').subscribe();
    http
      .expectOne('/api/organizations/org-1/me/authorization')
      .flush({ orgRole: 'MEMBER', memberBasePermission: 'READ' });

    store.loadProjectPermissions('proj-1').subscribe();
    http
      .expectOne('/api/projects/proj-1/me/permissions')
      .flush({ permissions: ['STORY_READ', 'DOCUMENT_READ'] });

    expect(store.has('STORY_READ')).toBe(true);
    expect(store.has('DOCUMENT_READ')).toBe(true);
    expect(store.has('STORY_WRITE')).toBe(false);
  });

  it('lets owner/admin bypass has() even before the project set loads', () => {
    store.loadOrgAuthorization('org-1').subscribe();
    http
      .expectOne('/api/organizations/org-1/me/authorization')
      .flush({ orgRole: 'OWNER', memberBasePermission: 'READ' });

    // No project permissions loaded, yet the owner passes every check.
    expect(store.has('STORY_WRITE')).toBe(true);
    expect(store.has('ROLE_DELETE')).toBe(true);
  });

  it('resetProject clears only the project set, keeping the org role', () => {
    store.loadOrgAuthorization('org-1').subscribe();
    http
      .expectOne('/api/organizations/org-1/me/authorization')
      .flush({ orgRole: 'MEMBER', memberBasePermission: 'READ' });
    store.loadProjectPermissions('proj-1').subscribe();
    http.expectOne('/api/projects/proj-1/me/permissions').flush({ permissions: ['STORY_READ'] });

    store.resetProject();

    expect(store.orgRole()).toBe('MEMBER');
    expect(store.projectPermissions().size).toBe(0);
    // A fresh project load fetches again after a reset.
    store.loadProjectPermissions('proj-1').subscribe();
    http.expectOne('/api/projects/proj-1/me/permissions').flush({ permissions: [] });
  });

  it('reset clears everything', () => {
    store.loadOrgAuthorization('org-1').subscribe();
    http
      .expectOne('/api/organizations/org-1/me/authorization')
      .flush({ orgRole: 'OWNER', memberBasePermission: 'READ' });

    store.reset();

    expect(store.orgRole()).toBeNull();
    expect(store.memberBasePermission()).toBeNull();
    expect(store.isOrgOwnerOrAdmin()).toBe(false);
  });
});
