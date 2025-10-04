const FormData = require('form-data')
const fs = require('fs')
const axios = require('axios')

const API_URL = 'http://localhost:5001/api'

async function uploadTCGADataset() {
  try {
    console.log('Creating TCGA GBM dataset...')

    // Step 1: Create the dataset
    const datasetResponse = await axios.post(`${API_URL}/datasets`, {
      name: 'TCGA GBM Pan-Can Atlas 2018',
      description: 'TCGA Glioblastoma clinical data including patient and sample information'
    })

    const datasetId = datasetResponse.data.dataset.id
    console.log(`Dataset created with ID: ${datasetId}`)

    // Step 2: Upload patients table
    console.log('\nUploading patients table...')
    const patientForm = new FormData()
    patientForm.append('file', fs.createReadStream('example_data/gbm_tcga_pan_can_atlas_2018/data_clinical_patient.txt'))
    patientForm.append('tableName', 'patients')
    patientForm.append('displayName', 'Clinical Patients')
    patientForm.append('skipRows', '4')
    patientForm.append('delimiter', '\t')
    patientForm.append('primaryKey', 'PATIENT_ID')

    const patientResponse = await axios.post(
      `${API_URL}/datasets/${datasetId}/tables`,
      patientForm,
      { headers: patientForm.getHeaders() }
    )
    console.log(`Patients table uploaded: ${patientResponse.data.table.rowCount} rows, ${patientResponse.data.table.columns} columns`)

    // Step 3: Upload samples table
    console.log('\nUploading samples table...')
    const sampleForm = new FormData()
    sampleForm.append('file', fs.createReadStream('example_data/gbm_tcga_pan_can_atlas_2018/data_clinical_sample.txt'))
    sampleForm.append('tableName', 'samples')
    sampleForm.append('displayName', 'Clinical Samples')
    sampleForm.append('skipRows', '4')
    sampleForm.append('delimiter', '\t')
    sampleForm.append('primaryKey', 'SAMPLE_ID')

    const sampleResponse = await axios.post(
      `${API_URL}/datasets/${datasetId}/tables`,
      sampleForm,
      { headers: sampleForm.getHeaders() }
    )
    console.log(`Samples table uploaded: ${sampleResponse.data.table.rowCount} rows, ${sampleResponse.data.table.columns} columns`)

    console.log('\n✅ TCGA dataset successfully uploaded!')
    console.log(`View at: http://localhost:3000/datasets/${datasetId}`)

  } catch (error) {
    console.error('Upload failed:', error.response?.data || error.message)
    process.exit(1)
  }
}

uploadTCGADataset()
