import { baseDataApi } from './baseData';

const ensureMaterialId = (id) => {
    if (!id || id === null || id === 'null' || id === 'undefined') {
        throw new Error('所选物料参数无效，请重新选择');
    }
    return id;
};

export const materialApi = {
    getMaterials: baseDataApi.getMaterials,
    getMaterial: (id) => baseDataApi.getMaterial(ensureMaterialId(id)),
    createMaterial: baseDataApi.createMaterial,
    updateMaterial: baseDataApi.updateMaterial,
    deleteMaterial: baseDataApi.deleteMaterial,
    getMaterialsByIds: baseDataApi.getMaterialsByIds,

    importMaterials: baseDataApi.importMaterials,
    importMaterialsJson: baseDataApi.importMaterialsJson,
    exportMaterials: baseDataApi.exportMaterials,
    downloadMaterialTemplate: baseDataApi.downloadMaterialTemplate,
    getNextMaterialCode: baseDataApi.getNextMaterialCode,
    getLatestMaterialByCategory: baseDataApi.getLatestMaterialByCategory,

    getMaterialAttachments: baseDataApi.getMaterialAttachments,
    uploadMaterialAttachment: baseDataApi.uploadMaterialAttachment,
    deleteMaterialAttachment: baseDataApi.deleteMaterialAttachment,

    updateMaterialStatus: baseDataApi.updateMaterialStatus,
    getMaterialStats: baseDataApi.getMaterialStats
};

export default materialApi;
