import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TutorRunState } from '../contracts/tutor-run-state';
import { TutorRunStore } from '../persistence/tutor-run-store';
import { TUTOR_RUN_STORE } from '../tutor.constants';

@Injectable()
export class TutorRunQueryService {
  constructor(@Inject(TUTOR_RUN_STORE) private readonly store: TutorRunStore) {}

  async get(runId: string): Promise<TutorRunState> {
    const run = await this.store.getRun(runId);
    if (!run) throw new NotFoundException('Tutor run not found.');
    return run;
  }
}
