#!/bin/bash

(cd ./travis-ftp && exec gulp deploy --user $FTP_USER --password $FTP_PASSWORD --host $FTP_HOST --dir $TRAVIS_BUILD_DIR/divingapp/dist/)
