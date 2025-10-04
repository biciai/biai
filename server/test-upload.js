import { parseCSVFile } from './src/services/fileParser.js'
import datasetService from './src/services/datasetService.js'

async function testUpload() {
  try {
    console.log('Parsing patient data...')
    const patientData = await parseCSVFile(
      '../example_data/gbm_tcga_pan_can_atlas_2018/data_clinical_patient.txt',
      4,
      '\t'
    )

    console.log(`Found ${patientData.rowCount} rows with ${patientData.columns.length} columns`)
    console.log('Columns:', patientData.columns.map(c => `${c.name} (${c.type})`).slice(0, 5))

    console.log('\nCreating dataset...')
    const dataset = await datasetService.createDataset(
      'TCGA GBM Clinical Patients',
      'data_clinical_patient.txt',
      'text/tab-separated-values',
      patientData,
      'TCGA Glioblastoma clinical patient data from PanCan Atlas 2018'
    )

    console.log('✓ Patient dataset created:', dataset.dataset_id)

    // Now upload sample data
    console.log('\nParsing sample data...')
    const sampleData = await parseCSVFile(
      '../example_data/gbm_tcga_pan_can_atlas_2018/data_clinical_sample.txt',
      4,
      '\t'
    )

    console.log(`Found ${sampleData.rowCount} rows with ${sampleData.columns.length} columns`)

    console.log('\nCreating dataset...')
    const dataset2 = await datasetService.createDataset(
      'TCGA GBM Clinical Samples',
      'data_clinical_sample.txt',
      'text/tab-separated-values',
      sampleData,
      'TCGA Glioblastoma clinical sample data from PanCan Atlas 2018'
    )

    console.log('✓ Sample dataset created:', dataset2.dataset_id)

    console.log('\n✓ All data uploaded successfully!')
    process.exit(0)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

testUpload()
