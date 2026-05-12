import { baseDataApi } from './baseData';

export const bomApi = {
    getBoms: baseDataApi.getBoms,
    getBom: baseDataApi.getBom,
    getBomDetails: baseDataApi.getBomDetails,
    createBom: baseDataApi.createBom,
    updateBom: baseDataApi.updateBom,
    deleteBom: baseDataApi.deleteBom,

    getBomStats: baseDataApi.getBomStats,
    exportBoms: baseDataApi.exportBoms,
    importBoms: baseDataApi.importBoms,
    downloadBomTemplate: baseDataApi.downloadBomTemplate,
    replaceBom: baseDataApi.replaceBom,
    locatePart: baseDataApi.locatePart,
    approveBom: baseDataApi.approveBom,
    unapproveBom: baseDataApi.unapproveBom,

    explodeBom: baseDataApi.explodeBom,
    detectCircularReference: baseDataApi.detectCircularReference,
    getMaterialSubBom: baseDataApi.getMaterialSubBom,
    refreshBomCache: baseDataApi.refreshBomCache
};

export default bomApi;
