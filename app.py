from flask import Flask, Response
import os
app = Flask(__name__, static_folder='static', static_url_path='')

def root_dir():  # pragma: no cover
    return ''
    #return os.path.abspath(os.path.dirname(__file__))

def get_file(filename):  # pragma: no cover
    try:
        src = os.path.join(root_dir(), filename)
        # Figure out how flask returns static files
        # Tried:
        # - render_template
        # - send_file
        # This should not be so non-obvious
        return open(src).read()
    except IOError as exc:
        return str(exc)

@app.route('/')
def hello_world():
	content = get_file('index.html')
	return Response(content, mimetype="text/html")


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)