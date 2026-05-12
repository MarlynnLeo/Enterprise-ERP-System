import { baseDataApi } from './baseData';

const ensureSupplierId = (id) => {
    if (!id) {
        throw new Error('Missing supplier id');
    }
    return id;
};

export const supplierApi = {
    getSuppliers: baseDataApi.getSuppliers,
    getSupplier: (id) => baseDataApi.getSupplier(ensureSupplierId(id)),
    createSupplier: baseDataApi.createSupplier,
    updateSupplier: (id, supplier) => baseDataApi.updateSupplier(ensureSupplierId(id), supplier),
    deleteSupplier: baseDataApi.deleteSupplier,

    exportSuppliers: baseDataApi.exportSuppliers,
    importSuppliers: baseDataApi.importSuppliers,
    downloadSupplierTemplate: baseDataApi.downloadSupplierTemplate
};

export default supplierApi;
