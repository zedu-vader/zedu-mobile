import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Share } from 'react-native';
import {
  pick,
  types,
  isErrorWithCode,
  errorCodes,
} from '@react-native-documents/picker';
import { FileActionKey } from '@/components/files/file-actions-sheet';
import { FolderActionKey } from '@/components/files/folder-actions-sheet';
import { PendingUploadFile } from '@/components/files/upload-confirmation-modal';
import useFiles from '@/hooks/useFiles';
import useFolders from '@/hooks/useFolders';
import { useFileUpload } from '@/hooks/useFileUpload';
import UseGetOrgMembers from '@/services/org/get-org-members';
import {
  createFolder,
  deleteFolder,
  updateFolder,
} from '@/services/files/folders';
import {
  deleteFile,
  moveFile,
  renameFile,
} from '@/services/files/file-actions';
import { useDataContext } from '@/store/useDataContext';
import { ACTIONS } from '@/store/types';
import { Folder, Media } from '@/types/thread';
import {
  decodeFileName,
  FileCategory,
  FileMode,
  FileSortOption,
} from '@/utils/file-helpers';
import {
  ActiveFilterSheet,
  DateFilterKey,
  FileManagementNavigation,
  FileManagementTab,
} from '@/types/file-management';
import { FilesListQueryFilters } from '@/types/files-api';
import {
  filterFolders,
  sortFileResults,
} from '@/utils/file-management-filters';

export const useFileManagement = (navigation: FileManagementNavigation) => {
  const { state, dispatch } = useDataContext();
  const { orgMembers = [], user, orgId } = state;
  UseGetOrgMembers();
  const { uploadFiles, isUploading } = useFileUpload();

  const [mode, setMode] = useState<FileMode>('all');
  const [activeTab, setActiveTab] = useState<FileManagementTab>('files');
  const [sortBy, setSortBy] = useState<FileSortOption>('newest');
  const [fileTypeFilter, setFileTypeFilter] = useState<FileCategory | null>(
    null,
  );
  const [uploadedByFilter, setUploadedByFilter] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilterKey>('any');
  const [activeSheet, setActiveSheet] = useState<ActiveFilterSheet>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedFileNameSearch, setDebouncedFileNameSearch] = useState('');
  const [sheetSearch, setSheetSearch] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [openFolder, setOpenFolder] = useState<Folder | null>(null);
  const [uploadConfirmVisible, setUploadConfirmVisible] = useState(false);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<
    PendingUploadFile[]
  >([]);
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderSaving, setFolderSaving] = useState(false);
  const [actionFile, setActionFile] = useState<Media | null>(null);
  const [fileActionsVisible, setFileActionsVisible] = useState(false);
  const [actionFolder, setActionFolder] = useState<Folder | null>(null);
  const [folderActionsVisible, setFolderActionsVisible] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    new Set(),
  );
  const [moveSheetVisible, setMoveSheetVisible] = useState(false);
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renamingFile, setRenamingFile] = useState<Media | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);

  const isFolderView = Boolean(openFolder);
  const isFoldersTab = activeTab === 'folders' && !isFolderView;
  const isFilesList = !isFoldersTab;
  const needsFolderPicker = moveSheetVisible || selectionMode;
  const currentUserId = user?.user_id ?? user?.id;

  const filterContext = useMemo(
    () => ({
      mode,
      sortBy,
      uploadedByFilter,
      dateFilter,
      searchQuery,
      currentUserId,
    }),
    [mode, sortBy, uploadedByFilter, dateFilter, searchQuery, currentUserId],
  );

  const filesApiFilters = useMemo<FilesListQueryFilters>(
    () => ({
      type:
        fileTypeFilter && fileTypeFilter !== 'all' ? fileTypeFilter : undefined,
      date_modified: dateFilter,
      owner: uploadedByFilter,
      file_name: debouncedFileNameSearch || undefined,
    }),
    [fileTypeFilter, dateFilter, uploadedByFilter, debouncedFileNameSearch],
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedFileNameSearch(searchQuery.trim());
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const {
    folders,
    loading: foldersLoading,
    refreshing: foldersRefreshing,
    error: foldersError,
    refresh: refreshFolders,
    loadMore: loadMoreFolders,
    hasMore: hasMoreFolders,
  } = useFolders({ mode, enabled: isFoldersTab || needsFolderPicker });

  const {
    files: rootFiles,
    loading: rootLoading,
    refreshing: rootRefreshing,
    error: rootError,
    refresh: refreshRoot,
    loadMore: loadMoreRoot,
    hasMore: hasMoreRoot,
  } = useFiles({
    mode,
    enabled: isFilesList && !isFolderView,
    filters: filesApiFilters,
  });

  const {
    files: folderFiles,
    loading: folderLoading,
    refreshing: folderRefreshing,
    error: folderError,
    refresh: refreshFolderFiles,
    loadMore: loadMoreFolderFiles,
    hasMore: hasMoreFolderFiles,
  } = useFiles({
    mode,
    folderId: openFolder?.id ?? null,
    enabled: isFolderView,
    filters: filesApiFilters,
  });

  const sourceFiles = isFolderView ? folderFiles : rootFiles;
  const loading = isFolderView ? folderLoading : rootLoading;
  const refreshing = isFolderView ? folderRefreshing : rootRefreshing;
  const error = isFolderView ? folderError : rootError;
  const refresh = isFolderView ? refreshFolderFiles : refreshRoot;
  const loadMore = isFolderView ? loadMoreFolderFiles : loadMoreRoot;
  const hasMore = isFolderView ? hasMoreFolderFiles : hasMoreRoot;

  const filteredFiles = useMemo(
    () => sortFileResults(sourceFiles, sortBy),
    [sourceFiles, sortBy],
  );

  const filteredFolders = useMemo(
    () => filterFolders(folders, filterContext),
    [folders, filterContext],
  );

  const ownerMap = useMemo(() => {
    const map = new Map<string, string>();
    orgMembers.forEach(member => {
      map.set(member.id, member.name || member.username || member.email);
    });
    if (currentUserId) {
      map.set(
        currentUserId,
        user?.full_name || user?.username || user?.email || 'You',
      );
    }
    return map;
  }, [orgMembers, user, currentUserId]);

  const pickerFolders = useMemo(
    () => folders.filter(folder => !folder.deleted_at),
    [folders],
  );

  const activeItemCount = isFoldersTab
    ? filteredFolders.length
    : filteredFiles.length;
  const activeLoading = isFoldersTab ? foldersLoading : loading;
  const activeRefreshing = isFoldersTab ? foldersRefreshing : refreshing;
  const activeError = isFoldersTab ? foldersError : error;
  const activeRefresh = isFoldersTab ? refreshFolders : refresh;
  const activeHasMore = isFoldersTab ? hasMoreFolders : hasMore;
  const activeLoadMore = isFoldersTab ? loadMoreFolders : loadMore;

  const getOwnerName = useCallback(
    (userId: string) => ownerMap.get(userId) || 'Unknown',
    [ownerMap],
  );

  const isFileOwner = useCallback(
    (file: Media) => Boolean(currentUserId && file.user_id === currentUserId),
    [currentUserId],
  );

  const isFolderOwner = useCallback(
    (folder: Folder) =>
      Boolean(currentUserId && folder.user_id === currentUserId),
    [currentUserId],
  );

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedFileIds(new Set());
    setMoveSheetVisible(false);
  }, []);

  const closeFileActions = useCallback(() => {
    setFileActionsVisible(false);
    setActionFile(null);
  }, []);

  const closeFolderActions = useCallback(() => {
    setFolderActionsVisible(false);
    setActionFolder(null);
  }, []);

  const closeFolderModal = useCallback(() => {
    if (folderSaving) return;
    setFolderModalVisible(false);
    setEditingFolder(null);
  }, [folderSaving]);

  const closeFilterSheet = useCallback(() => {
    setActiveSheet(null);
    setSheetSearch('');
  }, []);

  const openFilterSheet = useCallback(
    (sheet: ActiveFilterSheet) => {
      if (sheet === 'user') {
        setSheetSearch(uploadedByFilter || '');
      }
      setActiveSheet(sheet);
    },
    [uploadedByFilter],
  );

  const refreshAfterFileChange = useCallback(() => {
    refresh();
    if (isFolderView) refreshFolderFiles();
  }, [isFolderView, refresh, refreshFolderFiles]);

  const openDetail = useCallback(
    (file: Media) => {
      setSelectedFileId(file.id);
      navigation.navigate('FileDetail', { fileId: file.id });
    },
    [navigation],
  );

  const openFileActions = useCallback((file: Media) => {
    setActionFile(file);
    setFileActionsVisible(true);
  }, []);

  const openFolderActions = useCallback((folder: Folder) => {
    setActionFolder(folder);
    setFolderActionsVisible(true);
  }, []);

  const toggleFileSelection = useCallback((fileId: string) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const handleDeleteFiles = useCallback(
    (fileIds: string[], filesForLabel: Media[] = []) => {
      if (!fileIds.length) return;

      const title = fileIds.length === 1 ? 'Delete file' : 'Delete files';
      const message =
        fileIds.length === 1
          ? `Delete "${decodeFileName(
              filesForLabel[0]?.file_name || 'this file',
            )}"? This action cannot be undone.`
          : `Delete ${fileIds.length} files? This action cannot be undone.`;

      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const results = await Promise.all(
              fileIds.map(id => deleteFile(id)),
            );
            const failed = results.find(result => result.error);
            if (failed?.error) {
              dispatch({
                type: ACTIONS.ERROR,
                payload:
                  typeof failed.error === 'string'
                    ? failed.error
                    : 'Failed to delete file',
              });
              return;
            }

            dispatch({
              type: ACTIONS.SUCCESS,
              payload:
                fileIds.length === 1
                  ? 'File deleted successfully'
                  : 'Files deleted successfully',
            });
            closeFileActions();
            exitSelectionMode();
            refreshAfterFileChange();
          },
        },
      ]);
    },
    [closeFileActions, dispatch, exitSelectionMode, refreshAfterFileChange],
  );

  const handleDeleteFile = useCallback(
    (file: Media) => handleDeleteFiles([file.id], [file]),
    [handleDeleteFiles],
  );

  const handleDeleteSelectedFiles = useCallback(() => {
    const fileIds = Array.from(selectedFileIds);
    const selectedFiles = sourceFiles.filter(file =>
      selectedFileIds.has(file.id),
    );
    handleDeleteFiles(fileIds, selectedFiles);
  }, [handleDeleteFiles, selectedFileIds, sourceFiles]);

  const handleMoveToFolder = useCallback(
    async (folder: Folder) => {
      const fileIds = Array.from(selectedFileIds);
      if (fileIds.length !== 1) return;

      const [fileId] = fileIds;
      setMovingFolderId(folder.id);
      const { error } = await moveFile(fileId, folder.id);
      setMovingFolderId(null);

      if (error) {
        dispatch({
          type: ACTIONS.ERROR,
          payload: typeof error === 'string' ? error : 'Failed to move file',
        });
        return;
      }

      dispatch({ type: ACTIONS.SUCCESS, payload: 'File moved successfully' });
      setMoveSheetVisible(false);
      closeFileActions();
      exitSelectionMode();
      refresh();
      refreshFolders();
      if (isFolderView) refreshFolderFiles();
    },
    [
      closeFileActions,
      dispatch,
      exitSelectionMode,
      isFolderView,
      refresh,
      refreshFolderFiles,
      refreshFolders,
      selectedFileIds,
    ],
  );

  const handleShareFile = useCallback(
    async (file: Media) => {
      try {
        await Share.share({
          message: `${decodeFileName(file.file_name)}\n${file.file_link}`,
          url: file.file_link,
        });
        closeFileActions();
      } catch {
        dispatch({ type: ACTIONS.ERROR, payload: 'Unable to share this file' });
      }
    },
    [closeFileActions, dispatch],
  );

  const handleRenameSubmit = useCallback(
    async (fileName: string) => {
      if (!renamingFile) return;

      setRenameSaving(true);
      const { data, error: renameError } = await renameFile(
        renamingFile.id,
        fileName,
      );
      setRenameSaving(false);

      if (renameError || !data?.data) {
        dispatch({
          type: ACTIONS.ERROR,
          payload:
            typeof renameError === 'string'
              ? renameError
              : 'Failed to rename file',
        });
        return;
      }

      dispatch({
        type: ACTIONS.SUCCESS,
        payload: data.message || 'File renamed successfully',
      });
      setRenameModalVisible(false);
      setRenamingFile(null);
      closeFileActions();
      refreshAfterFileChange();
    },
    [closeFileActions, dispatch, refreshAfterFileChange, renamingFile],
  );

  const handleFileAction = useCallback(
    (action: FileActionKey) => {
      if (!actionFile) return;

      switch (action) {
        case 'select':
          closeFileActions();
          setSelectionMode(true);
          setSelectedFileIds(new Set([actionFile.id]));
          break;
        case 'move':
          closeFileActions();
          setSelectedFileIds(new Set([actionFile.id]));
          setMoveSheetVisible(true);
          break;
        case 'delete':
          closeFileActions();
          handleDeleteFile(actionFile);
          break;
        case 'preview':
          closeFileActions();
          openDetail(actionFile);
          break;
        case 'share':
          handleShareFile(actionFile);
          break;
        case 'rename':
          closeFileActions();
          setRenamingFile(actionFile);
          setRenameModalVisible(true);
          break;
        default:
          break;
      }
    },
    [
      actionFile,
      closeFileActions,
      handleDeleteFile,
      handleShareFile,
      openDetail,
    ],
  );

  const handleFilePress = useCallback(
    (file: Media) => {
      if (selectionMode) {
        toggleFileSelection(file.id);
        return;
      }
      openDetail(file);
    },
    [openDetail, selectionMode, toggleFileSelection],
  );

  const handlePickFiles = useCallback(async () => {
    try {
      const results = await pick({
        type: [types.allFiles],
        allowMultiSelection: true,
      });

      if (!results.length) return;

      setPendingUploadFiles(
        results.map(file => ({
          uri: file.uri,
          name: file.name || 'file',
          type: file.type || 'application/octet-stream',
          size: file.size ?? null,
        })),
      );
      setUploadConfirmVisible(true);
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED)
        return;
      dispatch({ type: ACTIONS.ERROR, payload: 'Unable to open file picker' });
    }
  }, [dispatch]);

  const handleRemovePendingFile = useCallback((index: number) => {
    setPendingUploadFiles(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (!next.length) setUploadConfirmVisible(false);
      return next;
    });
  }, []);

  const handleConfirmUpload = useCallback(async () => {
    if (!pendingUploadFiles.length) return;

    const { data, error: uploadError } = await uploadFiles(
      pendingUploadFiles,
      openFolder?.id,
    );
    if (uploadError || !data) {
      dispatch({
        type: ACTIONS.ERROR,
        payload:
          typeof uploadError === 'string'
            ? uploadError
            : 'Failed to upload files',
      });
      return;
    }

    setUploadConfirmVisible(false);
    setPendingUploadFiles([]);
    dispatch({ type: ACTIONS.SUCCESS, payload: 'Files uploaded successfully' });

    if (openFolder) {
      // Stay in the folder the files were uploaded into.
      refreshFolderFiles();
      refreshFolders();
      return;
    }

    setActiveTab('files');
    refreshRoot();
  }, [
    dispatch,
    openFolder,
    pendingUploadFiles,
    refreshFolderFiles,
    refreshFolders,
    refreshRoot,
    uploadFiles,
  ]);

  const handleNewFolder = useCallback(() => {
    setEditingFolder(null);
    setFolderModalVisible(true);
  }, []);

  const handleFolderSubmit = useCallback(
    async (name: string) => {
      setFolderSaving(true);

      if (editingFolder) {
        const { data, error } = await updateFolder(editingFolder.id, name);
        setFolderSaving(false);

        if (error || !data?.data) {
          dispatch({
            type: ACTIONS.ERROR,
            payload:
              typeof error === 'string' ? error : 'Failed to update folder',
          });
          return;
        }

        dispatch({
          type: ACTIONS.SUCCESS,
          payload: data.message || 'Folder updated successfully',
        });
      } else {
        if (!orgId) {
          setFolderSaving(false);
          dispatch({ type: ACTIONS.ERROR, payload: 'Organisation not found' });
          return;
        }

        const { data, error } = await createFolder(name, orgId);
        setFolderSaving(false);

        if (error || !data?.data) {
          dispatch({
            type: ACTIONS.ERROR,
            payload:
              typeof error === 'string' ? error : 'Failed to create folder',
          });
          return;
        }

        dispatch({
          type: ACTIONS.SUCCESS,
          payload: data.message || 'Folder created successfully',
        });
      }

      closeFolderModal();
      setActiveTab('folders');
      refreshFolders();
    },
    [closeFolderModal, dispatch, editingFolder, orgId, refreshFolders],
  );

  const handleDeleteFolder = useCallback(
    async (folder: Folder) => {
      const { data, error } = await deleteFolder(folder.id);

      if (error) {
        dispatch({
          type: ACTIONS.ERROR,
          payload:
            typeof error === 'string' ? error : 'Failed to delete folder',
        });
        return;
      }

      dispatch({
        type: ACTIONS.SUCCESS,
        payload: data?.message || 'Folder deleted successfully',
      });
      if (openFolder?.id === folder.id) {
        setOpenFolder(null);
      }
      setSelectedFolderId(null);
      closeFolderModal();
      closeFolderActions();
      refreshFolders();
    },
    [
      closeFolderActions,
      closeFolderModal,
      dispatch,
      openFolder,
      refreshFolders,
    ],
  );

  const handleDeleteFolderConfirm = useCallback(
    (folder: Folder) => {
      Alert.alert(
        'Delete folder',
        `Delete "${folder.name}"? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => handleDeleteFolder(folder),
          },
        ],
      );
    },
    [handleDeleteFolder],
  );

  const handleFolderAction = useCallback(
    (action: FolderActionKey) => {
      if (!actionFolder) return;

      switch (action) {
        case 'edit':
          closeFolderActions();
          setEditingFolder(actionFolder);
          setFolderModalVisible(true);
          break;
        case 'delete':
          closeFolderActions();
          handleDeleteFolderConfirm(actionFolder);
          break;
        default:
          break;
      }
    },
    [actionFolder, closeFolderActions, handleDeleteFolderConfirm],
  );

  const handleFolderPress = useCallback(
    (folder: Folder) => {
      setSelectedFolderId(folder.id);
      setOpenFolder(folder);
      exitSelectionMode();
    },
    [exitSelectionMode],
  );

  const handleFolderLongPress = useCallback(
    (folder: Folder) => {
      if (isFolderOwner(folder)) {
        openFolderActions(folder);
      }
    },
    [isFolderOwner, openFolderActions],
  );

  const handleHeaderBack = useCallback(() => {
    if (selectionMode) {
      exitSelectionMode();
      return;
    }
    if (openFolder) {
      setOpenFolder(null);
      setSelectedFolderId(null);
      return;
    }
    navigation.goBack();
  }, [exitSelectionMode, navigation, openFolder, selectionMode]);

  const handleTabChange = useCallback((tab: FileManagementTab) => {
    setActiveTab(tab);
    setOpenFolder(null);
  }, []);

  const sheetUsers = useMemo(() => {
    const query = sheetSearch.trim().toLowerCase();
    return orgMembers.filter(member => {
      const label = `${member.name || ''} ${member.username || ''} ${
        member.email || ''
      }`.toLowerCase();
      return !query || label.includes(query);
    });
  }, [orgMembers, sheetSearch]);

  return {
    // View state
    isFolderView,
    isFoldersTab,
    openFolder,
    selectionMode,
    selectedFileIds,
    selectedFileId,
    selectedFolderId,
    activeTab,

    // Filters
    mode,
    setMode,
    sortBy,
    setSortBy,
    fileTypeFilter,
    setFileTypeFilter,
    uploadedByFilter,
    setUploadedByFilter,
    dateFilter,
    setDateFilter,
    searchQuery,
    setSearchQuery,
    activeSheet,
    setActiveSheet,
    openFilterSheet,
    sheetSearch,
    setSheetSearch,
    closeFilterSheet,
    getOwnerName,
    sheetUsers,

    // Lists
    filteredFiles,
    filteredFolders,
    activeItemCount,
    activeLoading,
    activeRefreshing,
    activeError,
    activeRefresh,
    activeHasMore,
    activeLoadMore,
    loadMore,
    foldersLoading,
    pickerFolders,

    // File actions
    actionFile,
    fileActionsVisible,
    closeFileActions,
    isFileOwner,
    openFileActions,
    handleFilePress,
    handleFileAction,

    // Folder actions
    actionFolder,
    folderActionsVisible,
    closeFolderActions,
    isFolderOwner,
    handleFolderPress,
    handleFolderLongPress,
    handleFolderAction,

    // Selection & move
    exitSelectionMode,
    handleDeleteSelectedFiles,
    moveSheetVisible,
    setMoveSheetVisible,
    movingFolderId,
    handleMoveToFolder,

    // Modals
    renameModalVisible,
    setRenameModalVisible,
    renamingFile,
    setRenamingFile,
    renameSaving,
    handleRenameSubmit,
    uploadConfirmVisible,
    pendingUploadFiles,
    isUploading,
    handlePickFiles,
    handleRemovePendingFile,
    handleConfirmUpload,
    setUploadConfirmVisible,
    setPendingUploadFiles,
    folderModalVisible,
    editingFolder,
    folderSaving,
    closeFolderModal,
    handleNewFolder,
    handleFolderSubmit,

    // Navigation
    handleHeaderBack,
    handleTabChange,
  };
};

export type UseFileManagementReturn = ReturnType<typeof useFileManagement>;
