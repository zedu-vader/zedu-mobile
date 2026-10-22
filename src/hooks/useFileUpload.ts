import { useState } from 'react';
import { UploadRequest } from '@/utils/requests';
import { useDataContext } from '@/store/useDataContext';
import { ACTIONS } from '@/store/types';
import { prepareAssetForUpload } from '@/utils/compress-video';

export const useFileUpload = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedMedias, setUploadedMedias] = useState<any[]>([]);
  const { dispatch } = useDataContext();

  const uploadFiles = async (assets: any[], folderId?: string | null) => {
    dispatch({ type: ACTIONS.UPLOADING, payload: true });
    setIsUploading(true);

    const preparedAssets = await Promise.all(assets.map(prepareAssetForUpload));

    const formData = new FormData();

    preparedAssets.forEach(asset => {
      const fileName =
        asset.name || asset.uri?.split('/').pop() || 'upload.jpg';

      formData.append('files', {
        uri: asset.uri,
        type: asset.type || 'application/octet-stream',
        name: fileName,
      } as any);
    });

    // Without a folder_id the backend saves the files in the root directory.
    if (folderId) formData.append('folder_id', folderId);

    try {
      const response = await UploadRequest(`/files/upload-files`, formData);
      if (response && !response.error && response.data?.data) {
        const resultData = response.data.data;
        setUploadedMedias(prev => [...prev, ...resultData]);
        return { data: resultData, error: null };
      }
      return { data: null, error: response?.error };
    } catch (error) {
      return { data: null, error };
    } finally {
      setIsUploading(false);
      dispatch({ type: ACTIONS.UPLOADING, payload: false });
    }
  };

  const clearUploads = () => setUploadedMedias([]);

  return {
    uploadFiles,
    isUploading,
    uploadedMedias,
    clearUploads,
  };
};
