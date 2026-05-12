import { baseDataApi } from './baseData';

export const locationApi = {
    getLocations: baseDataApi.getLocations,
    getLocation: baseDataApi.getLocation,
    createLocation: baseDataApi.createLocation,
    updateLocation: baseDataApi.updateLocation,
    deleteLocation: baseDataApi.deleteLocation,
    exportLocations: baseDataApi.exportLocations
};

export default locationApi;
