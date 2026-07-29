import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRecorder } from "./recorder";
import { afterEach, describe, expect, it, vi } from "vitest";

class FakeMediaRecorder {
  static isTypeSupported = vi.fn((type: string) => type.includes("webm"));
  state: RecordingState = "inactive";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    _stream: MediaStream,
    readonly options?: MediaRecorderOptions,
  ) {}

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["voice"], { type: this.options?.mimeType }),
    } as BlobEvent);
    this.onstop?.();
  }
}

function RecorderHarness({
  onRecording = vi.fn(),
}: {
  onRecording?: (blob: Blob, durationMs: number) => void;
}) {
  const recorder = useRecorder({
    maxDurationMs: 5_000,
    disabled: false,
    onRecording,
  });
  return (
    <>
      <p>{recorder.status}</p>
      {recorder.error && <div role="alert">{recorder.error}</div>}
      <button type="button" onClick={recorder.start}>
        start
      </button>
      <button type="button" onClick={recorder.stop}>
        stop
      </button>
    </>
  );
}

describe("useRecorder", () => {
  const stopTrack = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records a negotiated browser format and stops microphone tracks", async () => {
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(() =>
          Promise.resolve({
            getTracks: () => [{ stop: stopTrack }],
          } as unknown as MediaStream),
        ),
      },
    });
    const onRecording = vi.fn();
    const user = userEvent.setup();
    render(<RecorderHarness onRecording={onRecording} />);

    await user.click(screen.getByRole("button", { name: "start" }));
    expect(await screen.findByText("recording")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "stop" }));

    await waitFor(() => expect(onRecording).toHaveBeenCalledTimes(1));
    expect(onRecording.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(stopTrack).toHaveBeenCalled();
    expect(FakeMediaRecorder.isTypeSupported).toHaveBeenCalled();
  });

  it("explains unsupported browsers while preserving the typed fallback", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    render(<RecorderHarness />);
    await userEvent.click(screen.getByRole("button", { name: "start" }));

    expect(await screen.findByText("unsupported")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Type your question instead",
    );
  });

  it("reports microphone permission denial and cleans up safely", async () => {
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(() =>
          Promise.reject(
            new DOMException("Permission denied", "NotAllowedError"),
          ),
        ),
      },
    });
    render(<RecorderHarness />);
    await userEvent.click(screen.getByRole("button", { name: "start" }));

    expect(await screen.findByText("denied")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Microphone permission was denied",
    );
  });
});
