import ReactTestRenderer from 'react-test-renderer';
import { useFileUpload } from '@/hooks/useFileUpload';
import { UploadRequest } from '@/utils/requests';

jest.mock('@/utils/requests', () => ({
  UploadRequest: jest.fn(),
}));
jest.mock('@/store/useDataContext', () => ({
  useDataContext: () => ({ dispatch: jest.fn() }),
}));
jest.mock('@/utils/compress-video', () => ({
  prepareAssetForUpload: (asset: unknown) => Promise.resolve(asset),
}));

const mockUploadRequest = UploadRequest as jest.Mock;
const asset = { uri: 'file:///notes.docx', name: 'notes.docx', type: 'doc' };

const renderUploadHook = () => {
  let hook!: ReturnType<typeof useFileUpload>;
  const Probe = () => {
    hook = useFileUpload();
    return null;
  };
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  return () => hook;
};

// Jest runs in Node, so the hook builds Node's FormData, which has get().
const sentFolderId = () =>
  (
    mockUploadRequest.mock.calls[0][1] as { get: (name: string) => unknown }
  ).get('folder_id');

describe('useFileUpload', () => {
  beforeEach(() => {
    mockUploadRequest.mockReset();
    mockUploadRequest.mockResolvedValue({
      data: { data: [{ id: 'file-1' }] },
      error: null,
    });
  });

  it('sends folder_id when uploading into a folder', async () => {
    const getHook = renderUploadHook();

    await ReactTestRenderer.act(async () => {
      await getHook().uploadFiles([asset], 'folder-1');
    });

    expect(sentFolderId()).toBe('folder-1');
  });

  it('omits folder_id when uploading to the root directory', async () => {
    const getHook = renderUploadHook();

    await ReactTestRenderer.act(async () => {
      await getHook().uploadFiles([asset]);
    });

    expect(sentFolderId()).toBeNull();
  });
});
