import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import { errorInterceptor, silentForbidden } from './error.interceptor';
import { ToastService } from '../../shared/toast/toast.service';

describe('errorInterceptor (403 handling)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => httpMock.verify());

  it('toasts the no-access message on a 403 and re-throws', async () => {
    const errorSpy = vi.spyOn(toast, 'error');
    const failure = vi.fn();

    http.get('/api/projects/p1/roles').subscribe({ error: failure });
    httpMock
      .expectOne('/api/projects/p1/roles')
      .flush('nope', { status: 403, statusText: 'Forbidden' });

    // The interceptor translates `authz.noAccess`; assert it toasted and re-threw.
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(failure).toHaveBeenCalled();
  });

  it('stays silent on a 403 when the request opts out, but still re-throws', () => {
    const errorSpy = vi.spyOn(toast, 'error');
    const failure = vi.fn();

    http.get('/api/projects/p1/jobs', { context: silentForbidden() }).subscribe({ error: failure });
    httpMock
      .expectOne('/api/projects/p1/jobs')
      .flush('nope', { status: 403, statusText: 'Forbidden' });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalled();
  });

  it('does not toast for non-403 errors', () => {
    const errorSpy = vi.spyOn(toast, 'error');
    http.get('/api/x').subscribe({ error: () => void 0 });
    httpMock.expectOne('/api/x').flush('boom', { status: 500, statusText: 'Server Error' });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
