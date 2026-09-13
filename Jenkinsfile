pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
    }

    triggers {
        pollSCM('* * * * *')
    }

    parameters {
        string(name: 'HOST_PORT', defaultValue: '8971', description: 'Loopback port exposed to the reverse proxy')
    }

    environment {
        IMAGE_NAME = 'shu-timetable-master-backend'
        CONTAINER_NAME = 'shu-timetable-master-backend'
        APP_ENV_CREDENTIALS_ID = 'shu-timetable-master-backend-env'
        DEPLOY_BRANCH = 'main'
        HOST_PORT = "${params.HOST_PORT ?: '8971'}"
    }

    stages {
        stage('Checkout') {
            steps {
                deleteDir()
                checkout scm
                script {
                    def branch = (env.BRANCH_NAME ?: env.GIT_BRANCH ?: '').replaceFirst(/^origin\//, '')

                    env.CURRENT_BRANCH = branch
                    env.DEPLOY_TARGET = branch == env.DEPLOY_BRANCH ? 'true' : 'false'
                }
            }
        }

        stage('Install') {
            steps {
                sh '''
                    set -eu
                    corepack enable
                    yarn install --immutable
                    yarn playwright:install
                '''
            }
        }

        stage('Generate catalog') {
            steps {
                withCredentials([file(credentialsId: env.APP_ENV_CREDENTIALS_ID, variable: 'APP_ENV_FILE')]) {
                    sh '''
                        set -eu
                        trap 'rm -f .env' EXIT HUP INT TERM
                        cp "${APP_ENV_FILE}" .env
                        yarn catalog:generate
                        test -s generated/catalog.json
                    '''
                }
            }
        }

        stage('Verify') {
            steps {
                sh '''
                    set -eu
                    yarn lint
                    yarn format:check
                    yarn typecheck
                    yarn test
                '''
            }
        }

        stage('Build image') {
            steps {
                sh '''
                    set -eu
                    docker build --tag "${IMAGE_NAME}:${GIT_COMMIT}" .
                '''
            }
        }

        stage('Smoke test') {
            when {
                environment name: 'DEPLOY_TARGET', value: 'false'
            }
            steps {
                withCredentials([file(credentialsId: env.APP_ENV_CREDENTIALS_ID, variable: 'APP_ENV_FILE')]) {
                    sh '''
                        set -eu
                        RELEASE_IMAGE="${IMAGE_NAME}:${GIT_COMMIT}" \
                        CANDIDATE_NAME="${CONTAINER_NAME}-candidate-${BUILD_TAG}" \
                        ./scripts/deploy-container.sh smoke
                    '''
                }
            }
        }

        stage('Deploy') {
            when {
                environment name: 'DEPLOY_TARGET', value: 'true'
            }
            steps {
                script {
                    lock(resource: 'shu-timetable-master-backend-production', inversePrecedence: true) {
                        withCredentials([file(credentialsId: env.APP_ENV_CREDENTIALS_ID, variable: 'APP_ENV_FILE')]) {
                            sh '''
                                set -eu
                                RELEASE_IMAGE="${IMAGE_NAME}:${GIT_COMMIT}" \
                                CANDIDATE_NAME="${CONTAINER_NAME}-candidate-${BUILD_TAG}" \
                                ./scripts/deploy-container.sh smoke

                                RELEASE_IMAGE="${IMAGE_NAME}:${GIT_COMMIT}" \
                                HOST_PORT="${HOST_PORT}" \
                                CONTAINER_NAME="${CONTAINER_NAME}" \
                                ROLLBACK_NAME="${CONTAINER_NAME}-rollback-${BUILD_TAG}" \
                                ./scripts/deploy-container.sh deploy
                            '''
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            sh 'docker rm -f "${CONTAINER_NAME}-candidate-${BUILD_TAG}" >/dev/null 2>&1 || true'
            script {
                def icon = [
                    SUCCESS: '✅',
                    FAILURE: '❌',
                    ABORTED: '⚠️',
                    UNSTABLE: '⚠️'
                ].get(currentBuild.currentResult, 'ℹ️')

                def message = """${icon} ${env.JOB_NAME} #${env.BUILD_NUMBER}: ${currentBuild.currentResult}
Branch: ${env.CURRENT_BRANCH ?: 'unknown'}
Commit: ${(env.GIT_COMMIT ?: 'unknown').take(7)}
Build: ${env.BUILD_URL}"""

                try {
                    withCredentials([
                        string(credentialsId: 'Telegram-Token', variable: 'TELEGRAM_TOKEN'),
                        string(credentialsId: 'Telegram-ID', variable: 'TELEGRAM_ID')
                    ]) {
                        withEnv(["TELEGRAM_MESSAGE=${message}"]) {
                            def notified = sh(
                                returnStatus: true,
                                script: '''
                                    set +x
                                    curl --silent --show-error --fail --max-time 10 --output /dev/null \
                                        --data-urlencode "chat_id=${TELEGRAM_ID}" \
                                        --data-urlencode "text=${TELEGRAM_MESSAGE}" \
                                        "${TELEGRAM_API_BASE:-https://api.telegram.org}/bot${TELEGRAM_TOKEN}/sendMessage"
                                '''
                            )

                            if (notified != 0) {
                                echo 'Telegram notification failed'
                            }
                        }
                    }
                } catch (Exception error) {
                    echo "Telegram notification unavailable: ${error.class.simpleName}"
                }
            }
        }
    }
}
