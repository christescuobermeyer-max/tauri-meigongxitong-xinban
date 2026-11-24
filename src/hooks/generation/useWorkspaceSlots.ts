import useBrandStoryWorkspace from "../useBrandStoryWorkspace";
import useMenuDesignWorkspace from "../useMenuDesignWorkspace";
import useDataAnalysisWorkspace from "../useDataAnalysisWorkspace";
import useDetailPageWorkspace from "../useDetailPageWorkspace";
import useImageEditWorkspace from "../useImageEditWorkspace";
import usePackageImageWorkspace from "../usePackageImageWorkspace";
import usePSignboardWorkspace from "../usePSignboardWorkspace";
import usePictureWallWorkspace from "../usePictureWallWorkspace";
import useProductBatchWorkspace from "../useProductBatchWorkspace";
import useProductImageWorkspace from "../useProductImageWorkspace";
import useThreePieceWorkspace from "../useThreePieceWorkspace";
import type { GenerationLine } from "../../types";
import type { useWorkspaceHistory } from "./useWorkspaceHistory";

interface Options {
  generationLine: GenerationLine;
  setGenerationLine: (line: GenerationLine) => void;
  toast: { show: (message: string, tone: "error" | "info" | "success") => void };
  recordHistory: ReturnType<typeof useWorkspaceHistory>["recordHistory"];
}

export function useWorkspaceSlots({ generationLine, setGenerationLine, toast, recordHistory }: Options) {
  const threePieceSlots = [
    useThreePieceWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useThreePieceWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useThreePieceWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useThreePieceWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useThreePieceWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useThreePieceWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useThreePieceWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useThreePieceWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useThreePieceWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useThreePieceWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
  ] as const;
  const productImageSlots = [
    useProductImageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductImageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductImageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductImageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductImageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductImageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductImageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductImageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductImageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductImageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
  ] as const;
  const productBatchSlots = [
    useProductBatchWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductBatchWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductBatchWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductBatchWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductBatchWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductBatchWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductBatchWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductBatchWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductBatchWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useProductBatchWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
  ] as const;
  const packageImageSlots = [
    usePackageImageWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePackageImageWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePackageImageWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePackageImageWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePackageImageWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePackageImageWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePackageImageWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePackageImageWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePackageImageWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePackageImageWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
  ] as const;
  const pictureWallSlots = [
    usePictureWallWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePictureWallWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePictureWallWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePictureWallWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePictureWallWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePictureWallWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePictureWallWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePictureWallWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePictureWallWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePictureWallWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
  ] as const;
  const pSignboardSlots = [
    usePSignboardWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePSignboardWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePSignboardWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePSignboardWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePSignboardWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePSignboardWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePSignboardWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePSignboardWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePSignboardWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    usePSignboardWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
  ] as const;
  const imageEditSlots = [
    useImageEditWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useImageEditWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useImageEditWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useImageEditWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useImageEditWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useImageEditWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useImageEditWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useImageEditWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useImageEditWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useImageEditWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
  ] as const;
  const detailPageSlots = [
    useDetailPageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDetailPageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDetailPageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDetailPageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDetailPageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDetailPageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDetailPageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDetailPageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDetailPageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDetailPageWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
  ] as const;
  const brandStorySlots = [
    useBrandStoryWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useBrandStoryWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useBrandStoryWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useBrandStoryWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useBrandStoryWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useBrandStoryWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useBrandStoryWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useBrandStoryWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useBrandStoryWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useBrandStoryWorkspace({ generationLine, setGenerationLine, onToast: toast.show, onRecordHistory: recordHistory }),
  ] as const;
  const dataAnalysisSlots = [
    useDataAnalysisWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDataAnalysisWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDataAnalysisWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDataAnalysisWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDataAnalysisWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDataAnalysisWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDataAnalysisWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDataAnalysisWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDataAnalysisWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
    useDataAnalysisWorkspace({ generationLine, onToast: toast.show, onRecordHistory: recordHistory }),
  ] as const;
  const menuDesign = useMenuDesignWorkspace({ onToast: toast.show, onRecordHistory: recordHistory });
  return { threePieceSlots, productImageSlots, productBatchSlots, packageImageSlots, pictureWallSlots, pSignboardSlots, imageEditSlots, detailPageSlots, brandStorySlots, dataAnalysisSlots, menuDesign };
}
